import { openUrl } from "@tauri-apps/plugin-opener";
import { RELEASES_PAGE_URL } from "@/lib/githubRelease";

/**
 * リリース一覧ページを既定ブラウザで開く。
 * 開く URL は固定（引数で受け取らない）。capability の許可 URL もこの 1 件だけに限定している。
 */
export function openReleasePage(): Promise<void> {
  return openUrl(RELEASES_PAGE_URL);
}
