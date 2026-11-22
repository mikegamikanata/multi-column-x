# 自律手動テスト リファレンス

## 前提: playwright-core

`scripts/cdp.cjs` は `playwright-core` を使う。このリポジトリは devDependency に `playwright` を持ち、`node_modules/playwright-core` が入っている。

- リポジトリルートを cwd にして実行するか、`MCX_REPO=<リポジトリルート>` を設定する
- `node_modules` が無い場合は、**リポジトリ外**の一時ディレクトリで `npm i playwright-core` し、`MCX_REPO` にそのディレクトリを指す。プロジェクトの依存関係は追加しない
- `connectOverCDP` で接続するだけなので、ブラウザのダウンロード（`playwright install`）は不要

## Windows スクリプト（`scripts/`）

PowerShell は `powershell -NoProfile -File <script> ...` で実行する（Git Bash からも同じ）。パスは引数で渡す。

| スクリプト        | 用途                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `win-launch.ps1`  | `-Exe <exe>`。`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=0` で起動し PID を出す。`-PidFile` で PID をファイルにも書く         |
| `cdp.cjs`         | CDP 接続ヘルパー（ライブラリ兼 CLI）。`ports` / `pages` / `eval <main\|accountId\|all> "<式>" [--label=…]`                                        |
| `win-window.ps1`  | `info` / `all` / `set -X -Y -W -H` / `close` / `min` / `restore` / `max`。`close` は主窓（タイトル `MultiColumnX`）にだけ WM_CLOSE                |
| `win-shot.ps1`    | `-ProcId -Out <png>`。PrintWindow（`PW_RENDERFULLCONTENT`）で主窓を撮る。他窓に隠れていても撮れる                                                 |
| `win-dialog.ps1`  | OS 保存ダイアログ。`info`（有無確認）/ `dump`（UIA で既定ファイル名等）/ `save -Path <フルパス>` / `cancel`                                       |
| `win-appdata.ps1` | `backup -Dir` / `diff -Dir`（settings.json を正規化 JSON で比較）/ `restore-settings -Dir` / `restore-all -Dir`（破壊的）。アプリ終了後に復元する |

### CDP の使い方

- アプリを `win-launch.ps1` で起動すると、WebView2 のデータディレクトリごとに `EBWebView\DevToolsActivePort` が作られる。`cdp.cjs` はそれを読んで接続する
  - メイン UI: `%LOCALAPPDATA%\com.natsuyasai.multicolumnx\EBWebView\`、ページ URL は `http://tauri.localhost/`
  - カラム / ポップアップ / コンポーズ: `%APPDATA%\com.natsuyasai.multicolumnx\accounts\<アカウントID>\EBWebView\`。アカウントごとに別ポート
- `cdp.cjs` の `labelOf(page)` で Tauri の WebView ラベル（`column-…` / `popup-…` / `compose-…`）を取れる。`findByLabel('popup')` で探せる
- 例（メイン UI の DOM を読む）:
  ```js
  const cdp = require("./cdp.cjs");
  const { p } = await cdp.main();
  console.log(await p.evaluate(() => document.title));
  process.exit(0); // 接続を残さない
  ```
- 一度に複数ページへ接続して状態をポーリングする場合は、`cdp.account(key)` で各アカウントのページを集め、`labelOf` で名前を付けて `evaluate` を回す

### 保存ダイアログ

1. アプリ側の操作（ダウンロード開始）の後、`win-dialog.ps1 info -ProcId <pid>` で `NODIALOG` でないことを確認する（出るまで数秒ポーリング）
2. 既定のファイル名は `dump` の `id=1001` の `name=` に出る
3. `save -Path <スクラッチ内のフルパス>` で保存、またはキャンセルの検証なら `cancel`
4. 保存後にファイルの存在とサイズ（可能なら再生可能か）を根拠にする

### 正常終了

`win-window.ps1 close -ProcId <pid>` のあと、プロセスが消えるまで待つ（`tasklist` で数十秒まで）。終了時に `windowBounds` 等が `settings.json` に保存されるため、終了直後の値を比較に使う。残る場合のみ最後の手段で強制終了する。

## Android スクリプト（`scripts/android-device.sh`）

`ANDROID_SERIAL=emulator-5554 bash android-device.sh <コマンド>`。コマンド一覧はスクリプト先頭のコメントを参照（`state-save` / `state-restore` / `shot` / `find` / `tap-text` / `font-scale` / `night` / `rotate` / `net` / `install` / `start` / `stop` など）。

- 端末設定を変える前に**必ず** `state-save <file>`。終了時に `state-restore <file>` し、もう一度 `state-save` して記録と同じか確認する
- 機内モード: エミュレータでは機内モードだけでは遮断されない。`net off` は wifi / data も切る。試験後は `net on`（または `state-restore`）で必ず戻す
- 座標: `find <テキスト>` が中心座標を返す。`dump` の XML を直接読んでもよい。画面サイズや font_scale で座標が変わるので固定値にしない
- 画面確認: `shot <png>` を Read で開いて目視する
- 端末の言語切替・テーマはアプリ設定ではなく端末設定に従う項目（動画ダウンロード通知など）がある（`docs/development/android-notes.md`）
- リリースビルドで効く項目（ProGuard）はデバッグ APK では確認できない。その場合は「未実施（リリースビルド要）」とする

## 既知の落とし穴

- **vitest / prettier が `.claude/worktrees/` を拾う**: ワークツリーを作った状態で `npm test` / `prettier --check .` を回すと、そちらも走る。対象パスを明示するか、不要なワークツリーを片付ける
- **computer-use はビルド版 exe の許可が得られない**ことがある。Windows の操作は CDP 方式を使う（computer-use に頼らない）
- **auto mode の分類器がアプリ内の削除確定などのタップを拒否することがある**。ユーザーへ許可を求め、他のエージェントに代行させない（SKILL.md「分類器に拒否された場合」）
- `npm run tauri:build` は署名鍵が無く NSIS 段階で失敗するが、exe は生成される。更新時刻で最新か確認する
- 正常終了で主窓以外（tao のタイトル空 16x16 ヘルパー窓）に WM_CLOSE を送ると挙動が不安定になる
- Windows と Android を並行実施すると cargo ロック待ちが発生する。ロック待ちは異常ではない
- 起動中のアプリのデータはロックされうる。退避・復元は終了後に行う

## 結果記録の例

`tmp/plans/<日付>-<対象名>/integration-test.md` の結果セル:

```
Android: OK（font_scale 1.3。欄見出しが「テーマと表示サイズ」で二重に見えない） / Win: OK（日本語。H3 が「テーマと表示サイズ」。shots/set-ja-win.png）
```
