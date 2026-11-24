import path from "node:path";
import { LOCAL_HOSTS, PORT, REPO_PATH } from "./constants.mjs";

/**
 * @typedef {{ signature: string, fileName: string }} PlatformArtifact
 * @typedef {{ "windows-x86_64"?: PlatformArtifact, "linux-x86_64"?: PlatformArtifact }} DesktopPlatforms
 * @typedef {{ file: string, signature: string }} DesktopRelease
 * @typedef {{ file: string, sha256: string }} ApkRelease
 * @typedef {{
 *   version: string,
 *   notes: string,
 *   pubDate: string,
 *   windows?: DesktopRelease,
 *   linux?: DesktopRelease,
 *   apk?: ApkRelease,
 * }} LoadedRelease release.json の内容に sig ファイルの中身(signature)を足したもの
 * @typedef {{ kind: "json", status: number, body: unknown }
 *   | { kind: "file", fileName: string }
 *   | { kind: "preflight" }
 *   | { kind: "notFound" }} RouteResult
 */

/**
 * @param {string} origin
 * @param {string} fileName
 */
function downloadUrl(origin, fileName) {
  return `${origin}/download/${encodeURIComponent(fileName)}`;
}

/**
 * tauri-plugin-updater 向けの latest.json を作る。
 * @param {{ version: string, notes: string, pubDate: string, origin: string, platforms: DesktopPlatforms }} p
 */
export function buildLatestJson({
  version,
  notes,
  pubDate,
  origin,
  platforms,
}) {
  /** @type {Record<string, { signature: string, url: string }>} */
  const out = {};
  for (const [key, art] of Object.entries(platforms)) {
    if (!art) continue;
    out[key] = {
      signature: art.signature,
      url: downloadUrl(origin, art.fileName),
    };
  }
  return { version, notes, pub_date: pubDate, platforms: out };
}

/**
 * GitHub Releases API の応答を模したオブジェクトを作る。
 * @param {{ version: string, notes: string, origin: string, apk?: { fileName: string, sha256: string }, badDigest?: boolean }} p
 */
export function buildGithubRelease({ version, notes, origin, apk, badDigest }) {
  return {
    tag_name: `v${version}`,
    body: notes,
    draft: false,
    prerelease: false,
    assets: apk
      ? [
          {
            name: apk.fileName,
            browser_download_url: downloadUrl(origin, apk.fileName),
            digest: `sha256:${badDigest ? "0".repeat(64) : apk.sha256}`,
          },
        ]
      : [],
  };
}

/**
 * 成果物ディレクトリ配下のファイルだけを解決する。配下でなければ null。
 * @param {string} rootDir
 * @param {string} fileName
 * @returns {string | null}
 */
export function resolveArtifactPath(rootDir, fileName) {
  if (typeof fileName !== "string" || fileName === "") return null;
  if (/[\\/\0]/.test(fileName)) return null;
  if (fileName === "." || fileName === "..") return null;
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, fileName);
  const rel = path.relative(root, resolved);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return resolved;
}

/**
 * Host ヘッダから応答に埋め込むオリジンを決める。未知のホストは localhost に倒す。
 * @param {string | undefined} hostHeader
 */
export function resolveOrigin(hostHeader) {
  const host = (hostHeader ?? "").toLowerCase();
  return LOCAL_HOSTS.includes(host)
    ? `http://${host}`
    : `http://localhost:${PORT}`;
}

/**
 * 数値 3 要素のバージョン比較（-1 / 0 / 1）。
 * @param {string} a
 * @param {string} b
 */
export function compareVersions(a, b) {
  const parse = (/** @type {string} */ v) =>
    v
      .replace(/^v/i, "")
      .split(".")
      .slice(0, 3)
      .map((n) => Number.parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

const DOWNLOAD_PREFIX = "/download/";

/**
 * リクエストをルーティングする純粋関数。I/O は行わない。
 * @param {{ method: string, pathname: string, host?: string, release: LoadedRelease, badDigest?: boolean }} req
 * @returns {RouteResult}
 */
export function routeRequest({ method, pathname, host, release, badDigest }) {
  if (method === "OPTIONS") return { kind: "preflight" };
  if (method !== "GET" && method !== "HEAD") return { kind: "notFound" };
  const origin = resolveOrigin(host);

  if (pathname === "/latest.json") {
    /** @type {DesktopPlatforms} */
    const platforms = {};
    if (release.windows) {
      platforms["windows-x86_64"] = {
        signature: release.windows.signature,
        fileName: release.windows.file,
      };
    }
    if (release.linux) {
      platforms["linux-x86_64"] = {
        signature: release.linux.signature,
        fileName: release.linux.file,
      };
    }
    return {
      kind: "json",
      status: 200,
      body: buildLatestJson({
        version: release.version,
        notes: release.notes,
        pubDate: release.pubDate,
        origin,
        platforms,
      }),
    };
  }

  const githubRelease = () =>
    buildGithubRelease({
      version: release.version,
      notes: release.notes,
      origin,
      apk: release.apk
        ? { fileName: release.apk.file, sha256: release.apk.sha256 }
        : undefined,
      badDigest,
    });

  if (pathname === `${REPO_PATH}/latest`) {
    return { kind: "json", status: 200, body: githubRelease() };
  }
  if (pathname === REPO_PATH) {
    return { kind: "json", status: 200, body: [githubRelease()] };
  }

  if (pathname.startsWith(DOWNLOAD_PREFIX)) {
    let fileName;
    try {
      fileName = decodeURIComponent(pathname.slice(DOWNLOAD_PREFIX.length));
    } catch {
      return { kind: "notFound" };
    }
    // ここでは名前の形だけを検査する。実パスの解決は resolveArtifactPath で行う。
    if (resolveArtifactPath("/artifacts-root", fileName) === null) {
      return { kind: "notFound" };
    }
    return { kind: "file", fileName };
  }

  return { kind: "notFound" };
}
