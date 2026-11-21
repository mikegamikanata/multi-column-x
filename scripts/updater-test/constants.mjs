import path from "node:path";
import { fileURLToPath } from "node:url";

/** ローカル配信サーバーのポート（固定。Rust 側の許可プレフィックスと一致させる）。 */
export const PORT = 8787;

/** 配信サーバーに到達できるホスト名（Host ヘッダ値）。10.0.2.2 は Android エミュレータからホストを指す。 */
export const LOCAL_HOSTS = [
  `localhost:${PORT}`,
  `127.0.0.1:${PORT}`,
  `10.0.2.2:${PORT}`,
];

/** GitHub Releases API を模したパス（アプリ側 githubRelease.ts と一致させる）。 */
export const REPO_PATH = "/repos/natsuyasai/multi-column-x/releases";

/** リポジトリルート（このファイルの 2 つ上）。 */
export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

/** 試験の作業データはすべてここ（git 管理外の tmp/ 配下）。 */
export const WORK_DIR = path.join(REPO_ROOT, "tmp", "updater-test");
export const KEYS_DIR = path.join(WORK_DIR, "keys");
export const ARTIFACTS_DIR = path.join(WORK_DIR, "artifacts");
export const RELEASE_JSON_PATH = path.join(ARTIFACTS_DIR, "release.json");
export const OVERLAY_CONFIG_PATH = path.join(
  WORK_DIR,
  "tauri.updater-test.conf.json",
);

/** 試験用の使い捨て署名鍵（本番鍵 .tauri-keys/ とは別。公開鍵は同名 + .pub）。 */
export const KEY_PATH = path.join(KEYS_DIR, "updater-test.key");
