import { isNewerVersion } from "./version";

export interface LatestRelease {
  version: string;
  notes?: string;
  apkUrl: string;
  apkSha256?: string;
}

const GITHUB_RELEASES_API =
  "https://api.github.com/repos/natsuyasai/multi-column-x/releases";
const REPO_RELEASES_PATH = "/repos/natsuyasai/multi-column-x/releases";

/** 既定ブラウザで開くリリース一覧ページ。固定値（capability の許可 URL と一致させること）。 */
export const RELEASES_PAGE_URL =
  "https://github.com/natsuyasai/multi-column-x/releases";

/** 更新試験ビルドではローカル配信サーバー、それ以外は GitHub Releases API。呼び出し時に評価する。 */
export function releasesApiBase(): string {
  const base = import.meta.env.VITE_UPDATER_RELEASE_API_BASE;
  return base
    ? `${base.replace(/\/$/, "")}${REPO_RELEASES_PATH}`
    : GITHUB_RELEASES_API;
}

interface GhAsset {
  name?: string;
  browser_download_url?: string;
  digest?: string;
}

/** GitHub アセットの digest("sha256:<hex>") から小文字64桁hexを取り出す。不正・非sha256ならnull。 */
export function parseDigestSha256(digest: string | undefined): string | null {
  if (!digest) return null;
  const prefix = "sha256:";
  if (!digest.startsWith(prefix)) return null;
  const hex = digest.slice(prefix.length);
  return /^[0-9a-f]{64}$/i.test(hex) ? hex.toLowerCase() : null;
}

/** GitHub Releases API の latest レスポンスから更新情報を抽出する。 */
export function parseLatestRelease(json: unknown): LatestRelease | null {
  if (!json || typeof json !== "object") return null;
  const obj = json as { tag_name?: string; body?: string; assets?: GhAsset[] };
  if (!obj.tag_name) return null;
  const apk = (obj.assets ?? []).find((a) => a.name?.endsWith(".apk"));
  if (!apk?.browser_download_url) return null;
  return {
    version: obj.tag_name.replace(/^v/i, ""),
    notes: obj.body || undefined,
    apkUrl: apk.browser_download_url,
    apkSha256: parseDigestSha256(apk.digest) ?? undefined,
  };
}

export interface WhatsNewEntry {
  version: string;
  notes: string;
}

export interface WhatsNewSelection {
  entries: WhatsNewEntry[];
  hasMore: boolean;
}

/** 表示する最大件数 */
export const WHATS_NEW_MAX_ENTRIES = 3;

/** 適格なリリース（公開済み・tag_name あり・本文あり）を WhatsNewEntry に変換する。不適格なら null。 */
function toWhatsNewEntry(raw: unknown): WhatsNewEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as {
    tag_name?: unknown;
    body?: unknown;
    draft?: unknown;
    prerelease?: unknown;
  };
  if (r.draft === true || r.prerelease === true) return null;
  if (typeof r.tag_name !== "string" || r.tag_name === "") return null;
  if (typeof r.body !== "string" || r.body.trim() === "") return null;
  return { version: r.tag_name.replace(/^v/i, ""), notes: r.body };
}

/** バージョン降順の比較関数（数値ドット比較）。 */
function compareVersionDesc(a: WhatsNewEntry, b: WhatsNewEntry): number {
  if (isNewerVersion(a.version, b.version)) return -1;
  if (isNewerVersion(b.version, a.version)) return 1;
  return 0;
}

/** 一覧 API の応答から、(lastSeen, current] のリリースノートを新しい順に最大3件選ぶ。 */
export function selectWhatsNewEntries(
  json: unknown,
  lastSeen: string,
  current: string,
): WhatsNewSelection {
  if (!Array.isArray(json)) return { entries: [], hasMore: false };
  const eligible = json
    .map(toWhatsNewEntry)
    .filter((e): e is WhatsNewEntry => e !== null)
    .filter(
      (e) =>
        isNewerVersion(e.version, lastSeen) &&
        !isNewerVersion(e.version, current),
    )
    .sort(compareVersionDesc);
  return {
    entries: eligible.slice(0, WHATS_NEW_MAX_ENTRIES),
    hasMore: eligible.length > WHATS_NEW_MAX_ENTRIES,
  };
}

/**
 * 一覧 API を 1 回呼んで (lastSeen, current] のリリースノートを選別する。
 * res.ok でなければ null。fetch の例外は呼び元へ伝える。
 */
export async function fetchWhatsNewSelection(
  lastSeen: string,
  current: string,
): Promise<WhatsNewSelection | null> {
  const res = await fetch(`${releasesApiBase()}?per_page=30`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return null;
  return selectWhatsNewEntries(await res.json(), lastSeen, current);
}

/** GitHub Releases API から最新リリース情報を取得する。 */
export async function fetchLatestRelease(): Promise<LatestRelease | null> {
  const res = await fetch(`${releasesApiBase()}/latest`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return null;
  return parseLatestRelease(await res.json());
}
