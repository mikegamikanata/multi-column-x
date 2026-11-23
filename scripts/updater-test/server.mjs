import fs from "node:fs";
import http from "node:http";
import { pathToFileURL } from "node:url";
import {
  ARTIFACTS_DIR,
  PORT,
  RELEASE_JSON_PATH,
  REPO_PATH,
} from "./constants.mjs";
import { resolveArtifactPath, routeRequest } from "./manifest.mjs";

/** @typedef {import("./manifest.mjs").LoadedRelease} LoadedRelease */

const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" };

/**
 * release.json を読み、sig ファイルの中身を signature として埋める。
 * @param {string} releaseJsonPath
 * @param {string} artifactsDir
 * @returns {LoadedRelease}
 */
export function loadRelease(releaseJsonPath, artifactsDir) {
  const raw = JSON.parse(fs.readFileSync(releaseJsonPath, "utf8"));
  /** @param {{ file: string, sig: string } | undefined} entry */
  const desktop = (entry) => {
    if (!entry) return undefined;
    const sigPath = resolveArtifactPath(artifactsDir, entry.sig);
    if (!sigPath) throw new Error(`Invalid sig file name: ${entry.sig}`);
    return {
      file: entry.file,
      signature: fs.readFileSync(sigPath, "utf8").trim(),
    };
  };
  return {
    version: raw.version,
    notes: raw.notes ?? "",
    pubDate: raw.pubDate ?? new Date().toISOString(),
    windows: desktop(raw.windows),
    linux: desktop(raw.linux),
    apk: raw.apk,
  };
}

/** @param {http.ServerResponse} res */
function sendNotFound(res) {
  const body = JSON.stringify({ message: "Not Found" });
  res.writeHead(404, {
    ...CORS_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * @param {LoadedRelease} release
 * @param {{ badDigest?: boolean, artifactsDir?: string }} [options]
 */
export function createServer(release, options = {}) {
  const artifactsDir = options.artifactsDir ?? ARTIFACTS_DIR;
  return http.createServer((req, res) => {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", "http://localhost");
    const result = routeRequest({
      method,
      pathname: url.pathname,
      host: req.headers.host,
      release,
      badDigest: options.badDigest,
    });
    /** @param {number} status */
    const log = (status) =>
      console.log(`${method} ${url.pathname} -> ${status}`);

    if (result.kind === "preflight") {
      res.writeHead(204, {
        ...CORS_HEADERS,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      });
      res.end();
      log(204);
      return;
    }
    if (result.kind === "json") {
      const body = JSON.stringify(result.body);
      res.writeHead(result.status, {
        ...CORS_HEADERS,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
      });
      res.end(method === "HEAD" ? undefined : body);
      log(result.status);
      return;
    }
    if (result.kind === "file") {
      const filePath = resolveArtifactPath(artifactsDir, result.fileName);
      let size = -1;
      try {
        if (filePath) {
          const st = fs.statSync(filePath);
          if (st.isFile()) size = st.size;
        }
      } catch {
        size = -1;
      }
      if (!filePath || size < 0) {
        sendNotFound(res);
        log(404);
        return;
      }
      res.writeHead(200, {
        ...CORS_HEADERS,
        "Content-Type": "application/octet-stream",
        "Content-Length": size,
      });
      if (method === "HEAD") {
        res.end();
      } else {
        const stream = fs.createReadStream(filePath);
        stream.on("error", () => res.destroy());
        stream.pipe(res);
      }
      log(200);
      return;
    }
    sendNotFound(res);
    log(404);
  });
}

/**
 * @param {http.Server} server
 * @param {string} host
 */
function listen(server, host) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, host, () => {
      server.off("error", reject);
      resolve(undefined);
    });
  });
}

async function main() {
  const badDigest = process.argv.includes("--bad-digest");
  if (!fs.existsSync(RELEASE_JSON_PATH)) {
    console.error(`release.json not found: ${RELEASE_JSON_PATH}`);
    console.error("Build a new-version artifact first, for example:");
    console.error(
      "  npm run updater-test:build -- --target <windows|linux|android> --role new --version <x.y.z>",
    );
    process.exit(1);
  }
  const release = loadRelease(RELEASE_JSON_PATH, ARTIFACTS_DIR);

  // localhost が IPv4 / IPv6 のどちらに解決されても届くよう、loopback の両方で待ち受ける（LAN には公開しない）。
  await listen(createServer(release, { badDigest }), "127.0.0.1");
  try {
    await listen(createServer(release, { badDigest }), "::1");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `Warning: could not listen on ::1 (${message}); continuing with 127.0.0.1 only`,
    );
  }

  console.log(`Updater test server listening on port ${PORT}`);
  console.log(`  version: ${release.version}`);
  console.log(`  windows: ${release.windows?.file ?? "(not available)"}`);
  console.log(`  linux: ${release.linux?.file ?? "(not available)"}`);
  console.log(`  android: ${release.apk?.file ?? "(not available)"}`);
  if (badDigest)
    console.log("  --bad-digest: APK digest is intentionally wrong");
  console.log("URLs:");
  console.log(`  http://localhost:${PORT}/latest.json`);
  console.log(`  http://localhost:${PORT}${REPO_PATH}/latest`);
  console.log(`  http://localhost:${PORT}${REPO_PATH}?per_page=30`);
  console.log(`  http://localhost:${PORT}/download/<file>`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
