# アプリ更新の試験（リリースを作らずに更新を試す）

実際の GitHub Release を作らずに、更新の検知・取得・適用を試験するための仕組み。目的に応じて次の 2 段階を使い分ける。

| 方式             | 何を確かめられるか                                              | ネットワーク | 実インストール |
| ---------------- | --------------------------------------------------------------- | ------------ | -------------- |
| (A) UI モック    | 起動時・手動チェック → ダイアログ → 進捗 → 失敗表示の画面遷移   | 不要         | しない         |
| (B) ローカル配信 | 本物の更新処理（取得・署名/ハッシュ検証・インストール・再起動） | ローカルのみ | する           |

手動テスト項目は [updater-test/integration-test.md](updater-test/integration-test.md)。

## (A) UI モック

ビルド時の環境変数 `VITE_UPDATER_MOCK` を付けると、`createUpdater`（`src/services/updater.ts`）が偽の Updater（`src/services/mockUpdater.ts`）を返す。デスクトップ・Android 共通。

| 値              | 挙動                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------- |
| `available`     | 更新 9.9.9 を検出。適用すると進捗 5 段 → インストール中 → 再起動中（実際には何もしない） |
| `none`          | 「最新です」                                                                             |
| `check-error`   | 確認に失敗                                                                               |
| `install-error` | 検出後、適用の途中で失敗                                                                 |
| `slow-progress` | 進捗が 20 段 × 1 秒でゆっくり進む                                                        |

```powershell
$env:VITE_UPDATER_MOCK="available"; npm run tauri:dev
```

```bash
VITE_UPDATER_MOCK=available npm run tauri:dev
```

- 起動時の自動チェックはカラム復元後（`useAppUpdater` の `ready`）に走る。「後で」を押すとそのバージョン（9.9.9）が `localStorage` に見送り記録され、次回起動時は表示されない。手動チェック（設定画面）は見送り記録を無視する。
- 未設定・未知の値では本物の更新処理が使われる。未設定ビルドではモック分岐ごとバンドルから除去される（`dist/` に目印文字列 `mcx-updater-mock` が含まれないことを確認済み）。

## (B) ローカル配信

`scripts/updater-test/` の Node スクリプト（依存追加なし）で、試験用ビルドと配信を行う。作業データはすべて `tmp/updater-test/`（git 管理外）に置く。

| ファイル                       | 役割                                                                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `setup.mjs`                    | 試験用の署名鍵を `tmp/updater-test/keys/` に生成（`tauri signer generate`、パスワード無し）                                        |
| `build.mjs`                    | 重ね設定（`--config`）を生成して試験用ビルド。`--role new` は成果物を `tmp/updater-test/artifacts/` に集めて `release.json` を書く |
| `server.mjs`                   | ポート 8787 で `latest.json`・偽 GitHub Releases API・成果物を配信                                                                 |
| `overlay.mjs` / `manifest.mjs` | 重ね設定・配信内容を作る純粋関数                                                                                                   |

### 共通の準備

```bash
npm run updater-test:setup
```

### デスクトップ（Windows / Linux AppImage）

> **注意**: 試験用ビルドは本番と同じ `identifier`（`com.natsuyasai.multicolumnx`）で、普段使いのインストールを上書きし、設定・アカウントのデータも共有する。更新後のアプリは取得先が `localhost:8787`・公開鍵が試験用のままなので、GitHub からは二度と更新されない。試験後は GitHub Releases から正式版をインストールし直すこと。重ね設定で `identifier` を変えないのは、Android ではパッケージ名が変わってしまう（Kotlin のパッケージは固定）ため。

1. 旧版（現行バージョン）を試験設定でビルドしてインストールする。

   ```bash
   npm run updater-test:build -- --target windows --role old
   ```

   Linux は `--target linux`。旧版は `src-tauri/target/release/bundle/{nsis,appimage}/` に出力される。

2. 新版（現行より大きいバージョン）をビルドして配信ディレクトリに集める。

   ```bash
   npm run updater-test:build -- --target windows --role new --version 0.8.7
   ```

3. 配信サーバーを起動する。

   ```bash
   npm run updater-test:serve
   ```

4. 旧版を起動し、更新ダイアログから更新する（設定画面の手動チェックでも可）。

Windows と Linux の成果物は同じバージョンなら 1 つの `release.json` にマージされる（別マシンでビルドした場合は `tmp/updater-test/artifacts/` をコピーしてサーバーを起動する）。バージョンが変わると他プラットフォームの項目は破棄される。

### Android

> **注意**: debug 署名の APK は、リリース署名でインストール済みのアプリに上書きできない。正式版が入っている端末では先にアンインストールが必要で、そのアプリのデータは失われる。試験後は正式版をインストールし直すこと。

1. 旧版の debug APK をビルドしてインストールする（試験用ビルドは cargo feature `updater-test` 付き・debug ビルドで行う。debug は平文 HTTP が許可されている）。

   ```bash
   npm run updater-test:build -- --target android --role old
   ```

2. 新版をビルドする（同じマシンの debug 署名で、versionCode が上がる版にする必要がある）。

   ```bash
   npm run updater-test:build -- --target android --role new --version 0.8.7
   ```

3. サーバーを起動し、端末からつなぐ。
   - 実機: `adb reverse tcp:8787 tcp:8787`（端末の `localhost:8787` が PC に転送される）
   - エミュレータ: ビルド時に `--emulator` を付ける（取得先が `http://10.0.2.2:8787` になる）

   ```bash
   npm run updater-test:serve
   ```

4. 旧版で更新を実行し、OS のインストーラが起動することを確認する。

`build.mjs` は Android ビルドの前に `src-tauri/gen/android/app/tauri.properties`（tauri-cli がバージョンから versionCode を書き戻す）を退避し、終了後に復元する。

### 異常系

- **APK ハッシュ不一致**: `node scripts/updater-test/server.mjs --bad-digest` で、APK の digest を不一致値にして配信する → インストーラが起動しないこと。
- **署名不一致（デスクトップ）**: 別の鍵で署名した成果物を配信する。例: `tmp/updater-test/keys/` を退避して `updater-test:setup` で鍵を作り直し、新版だけビルドし直す（旧版は元の鍵の公開鍵を持つ）→ 適用失敗が表示され旧版のまま動作すること。

## 設計判断

- **本番に影響しない構成**: 本番の `tauri.conf.json`（pubkey / endpoints / CSP）は変更せず、試験用の値は `tmp/updater-test/tauri.updater-test.conf.json`（`--config` の JSON Merge Patch）でだけ差し替える。重ね設定の内容は次のとおり。
  - endpoints: `http://localhost:8787/latest.json`
  - pubkey: 試験用の鍵
  - `dangerousInsecureTransportProtocol: true`（tauri-plugin-updater は既定で http の取得先を拒否するため）
  - CSP の `connect-src` に 8787 のオリジン 3 つを追加
- **本番鍵を使わない**: 試験用の鍵は使い捨てで、本番の鍵（`.tauri-keys/`）は参照しない。成果物の署名は `TAURI_SIGNING_PRIVATE_KEY` で試験用の鍵を渡す。
- **Android の APK URL 許可はコンパイル時に決める**: `install_apk_update` は自リポジトリの GitHub Releases の URL だけを許可する（`src-tauri/src/commands/update.rs`）。ローカル配信の `http://{localhost,127.0.0.1,10.0.2.2}:8787/download/` は cargo feature `updater-test`（既定は無効）のときだけ追加で許可する。実行時の切り替えにしないのは、本番バイナリに許可経路を残さないため。main ウィンドウ限定と sha256 検証はそのまま。
- **リリース情報の取得先**: Android は JS から GitHub Releases API を fetch するため、`VITE_UPDATER_RELEASE_API_BASE` で取得先を差し替える（`src/lib/githubRelease.ts` の `releasesApiBase()`）。Android WebView（`http://tauri.localhost`）からのクロスオリジン fetch になるため、サーバーは全応答に `Access-Control-Allow-Origin: *` を付ける。
- **サーバーは LAN に公開しない**: `127.0.0.1` と `::1` だけで待ち受ける（`localhost` が IPv6 に解決される環境に対応するため）。`/download/` は成果物ディレクトリ直下のファイル名だけを受け付け、区切り文字・`..` を拒否する。
- **契約テスト**: `scripts/updater-test/productionConfig.contract.test.ts` で次の 4 点を固定している。
  - 本番の pubkey / endpoints が変わっていない
  - 平文 HTTP を許可していない
  - `updater-test` が既定で無効
  - `release.yml` がモック・取得先差し替え・feature・重ね設定のいずれも使わない
