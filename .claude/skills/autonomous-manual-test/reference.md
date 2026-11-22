# 自律手動テスト リファレンス

## 前提: playwright-core

`scripts/cdp.cjs` は `playwright-core` を使う。このリポジトリは devDependency に `playwright` を持ち、`node_modules/playwright-core` が入っている。

- リポジトリルートを cwd にして実行するか、`MCX_REPO=<リポジトリルート>` を設定する
- `node_modules` が無い場合は、**リポジトリ外**の一時ディレクトリで `npm i playwright-core` し、`MCX_REPO` にそのディレクトリを指す。プロジェクトの依存関係は追加しない
- `connectOverCDP` で接続するだけなので、ブラウザのダウンロード（`playwright install`）は不要

## Windows スクリプト（`scripts/`）

PowerShell は `powershell -NoProfile -File <script> ...` で実行する（Git Bash からも同じ）。パスは引数で渡す。

| スクリプト          | 用途                                                                                                                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `win-launch.ps1`    | `-Exe <exe>`。`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=0` で起動し PID を出す。`-PidFile` で PID をファイルにも書く                                                                  |
| `cdp.cjs`           | CDP 接続ヘルパー（ライブラリ兼 CLI）。`ports` / `pages` / `eval <main\|accountId\|all> "<式>" [--label=…]`                                                                                                 |
| `win-window.ps1`    | `info` / `all` / `set -X -Y -W -H` / `close` / `min` / `restore` / `max`。`close` は主窓（タイトル `MultiColumnX`）にだけ WM_CLOSE                                                                         |
| `win-shot.ps1`      | `-ProcId -Out <png>`。PrintWindow（`PW_RENDERFULLCONTENT`）で主窓を撮る。他窓に隠れていても撮れる                                                                                                          |
| `win-dialog.ps1`    | OS 保存ダイアログ。`info`（有無確認）/ `dump`（UIA で既定ファイル名等）/ `save -Path <フルパス>` / `cancel`                                                                                                |
| `win-appdata.ps1`   | `backup -Dir` / `diff -Dir [-IgnoreWindowBounds]`（settings.json を `json-diff.cjs` で意味比較し、差分のキーのパスを表示）/ `restore-settings -Dir` / `restore-all -Dir`（破壊的）。アプリ終了後に復元する |
| `json-diff.cjs`     | 2 つの JSON を意味比較（キー順・数値表記は無視）。`node json-diff.cjs a.json b.json [--ignore=windowBounds]`                                                                                               |
| `win-closewait.ps1` | `-ProcId <pid> [-TimeoutSec 30]`。主窓に WM_CLOSE → プロセス消滅を待ち、経過時間と残存有無を出す（強制終了はしない。残れば終了コード 1）                                                                   |
| `col-add-ext.cjs`   | `node col-add-ext.cjs <https://URL> mcxtest-<名前>`。外部サイトカラムをテスト用に追加（追加ダイアログを CDP で操作）。ラベルが `mcxtest-` で始まらなければ拒否                                             |
| `col-close.cjs`     | `node col-close.cjs mcxtest-<名前>`。ラベル指定でカラムの閉じるボタン → 確認ダイアログの「削除する」を確定。`mcxtest-` が無いラベル・一致が 1 つでない場合は拒否。**テスト用に追加したカラムだけに使う**   |
| `settings-edit.cjs` | `get / set / push / remove <キーパス> ['<JSON値>']`。アプリ終了中に `settings.json` を編集（例: `pendingDataDirectoryDeletions` への追記・削除）。アプリ起動中は拒否                                       |
| `open.cjs`          | 実クリックの代わりに invoke でウィンドウを開く。`node open.cjs media link compose --account=<dir名> --id=<accountId>`                                                                                      |

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
- 外部サイトカラムは `%APPDATA%com.natsuyasai.multicolumnxexternal_columnscolumn-<id>EBWebView` に独立データを持ち、`cdp.cjs ports` / `pages` はそれも走査する（キーは `column-<id>`）
- 一度に複数ページへ接続して状態をポーリングする場合は、`cdp.account(key)` で各アカウントのページを集め、`labelOf` で名前を付けて `evaluate` を回す

### 保存ダイアログ

1. アプリ側の操作（ダウンロード開始）の後、`win-dialog.ps1 info -ProcId <pid>` で `NODIALOG` でないことを確認する（出るまで数秒ポーリング）
2. 既定のファイル名は `dump` の `id=1001` の `name=` に出る
3. `save -Path <スクラッチ内のフルパス>` で保存、またはキャンセルの検証なら `cancel`
4. 保存後にファイルの存在とサイズ（可能なら再生可能か）を根拠にする

### 代替手順の例: ポップアップ等を invoke で開く

実クリックで開けない・手間がかかるときは、`open.cjs` が CDP 経由で Tauri コマンドを invoke して開く（メイン UI から `open_link_popup_window` / `open_compose_window`、カラム WebView から `open_popup_window`）。アカウントのデータ dir 名は `node cdp.cjs ports` で、`--id` はアカウント ID（settings.json）で分かる。結果セルには「代替: invoke で開いた」と明記する。

```
node scripts/open.cjs media link compose --account=account-<uuid> --id=<accountId>
```

### 正常終了

`win-closewait.ps1 -ProcId <pid>` で主窓に WM_CLOSE を送り、プロセスが消えるまで待つ（既定 30 秒。経過時間と残存有無が出る）。終了時に `windowBounds` 等が `settings.json` に保存されるため、終了直後の値を比較に使う。

- **`windowBounds` は client（内側）サイズで保存される**。`win-window.ps1 info` の `outer` ではなく `client w= h=` の値と比べる
- `win-window.ps1 set` で `-H` が効かないとき: 旧版はパラメータ `$H` とループ変数 `$h` が（大文字小文字非区別で）衝突していた。現行は `$hw` で修正済み。PowerShell スクリプトを書くときは同様の衝突に注意する残る場合のみ最後の手段で強制終了する。

## Linux スクリプト（`scripts/`）

`bash <script> ...` / `python3 <script> ...` / `node <script> ...` で実行する（実行権限付き）。依存は Node 22+・python3（`gi` の Atspi）・`xwininfo`・ImageMagick `import`・`curl` のみで、`wk.cjs` は `playwright-core` も不要。

| スクリプト           | 用途                                                                                                                                                                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `linux-launch.sh`    | `<AppImage またはバイナリ> [--wayland] [--pid-file f] [--log f]`。`WEBKIT_INSPECTOR_HTTP_SERVER=127.0.0.1:$MCX_WK_PORT`（既定 9340）+ 既定 `GDK_BACKEND=x11` で起動し、`PID=<n>` を出す。起動前に `multicolumnx` の起動中を拒否し、`free -h` と `/tmp` の残骸を表示。インスペクタの応答と X11 主窓が見えるまで待つ |
| `wk.cjs`             | WebKit インスペクタ接続ヘルパー（ライブラリ兼 CLI）。`targets` / `eval <main\|all\|番号\|URL 部分一致> "<式>"` / `shot <対象> <out.png> [x y w h]`。ライブラリは `connect(target)` → `{evaluate, snapshot, call, close}`                                                                                           |
| `linux-window.py`    | `info`（主窓・カラム窓の ID / 座標 / サイズ）/ `id` / `close`（主窓だけに `WM_DELETE_WINDOW`）/ `move <x> <y>` / `resize <w> <h>`。python3 ctypes + libX11 と `xwininfo`                                                                                                                                           |
| `linux-closewait.sh` | `<pid> [timeout]`。`linux-window.py close` → プロセス消滅を待ち、経過秒と残存を出す（強制終了はしない。残れば exit 1）                                                                                                                                                                                             |
| `linux-shot.sh`      | `<out.png> [--root]`。`import -window` で主窓（または root）を撮る。X11 窓だけ。カラムは別窓なので写らない（`wk.cjs shot` を使う）                                                                                                                                                                                 |
| `linux-dialog.py`    | GTK 保存ダイアログ（AT-SPI）。`info` / `dump` / `name` / `save <フルパス>` / `cancel`。Windows の `win-dialog.ps1` 相当                                                                                                                                                                                            |
| `linux-appdata.sh`   | `backup <dir>` / `diff <dir> [--ignore-window-bounds]`（`json-diff.cjs` で `settings.json` を意味比較）/ `restore-settings <dir>` / `restore-all <dir>`（破壊的）。起動中は backup / restore を拒否。データは `${XDG_DATA_HOME:-~/.local/share}/com.natsuyasai.multicolumnx`（`MCX_DATA_DIR` で変更可）            |
| `linux-procs.sh`     | `tree <pid>`（子孫の PID / PPID / comm / cmdline）/ `maps <pid> <文字列>`（子孫全体の `environ` / `fd` / `maps` に文字列があるか。あれば exit 1）/ `mounts`（`/tmp/.mount_*`）/ `kill <root-pid> <pid> [signal]`（子孫であることを検証してから送る）                                                               |
| `json-diff.cjs`      | Windows と共通                                                                                                                                                                                                                                                                                                     |

### インスペクタの使い方

- 一覧は `http://127.0.0.1:<port>/`（HTML。`/json` は無い）。各行の `targetname` / `targeturl` と `/socket/<conn>/<target>/WebPage`（または `ServiceWorker`）から `wk.cjs targets` が表を作る。メイン UI は URL `tauri://localhost`（タイトル `Tauri + React + Typescript`）、カラムは `https://x.com/…`（カラムごとに別ターゲット。タイトルは空のことが多いので URL で選ぶ。同じ URL のカラムは複数一致する）、ServiceWorker も列挙される。ターゲット番号は WebView の生成順で、カラムの再生成やアプリ再起動で変わる
- 接続の流れ: `ws://127.0.0.1:<port>/socket/<conn>/<target>/WebPage` に接続 → まず `Target.targetCreated`（`targetInfo.type==='page'` の `targetId`。frame 型も届くので type で選ぶ）が届く → その `targetId` に対して `Target.sendMessageToTarget`（`params: {targetId, message: <内側コマンドの JSON 文字列>}`）で内側コマンドを送る。トップレベルに `Runtime.evaluate` を送ると `'Runtime' domain was not found`。応答は `Target.dispatchMessageFromTarget` の `params.message`（JSON 文字列）。ページ ID は再読み込みで変わるので、接続のたびに `targetCreated` を待つ（`wk.cjs` はそうしている）
- 内側コマンド: `Runtime.evaluate {expression, returnByValue}`、`Runtime.awaitPromise`、`Runtime.callFunctionOn`、`Page.snapshotRect {x,y,width,height,coordinateSystem:'Viewport'}`（PNG の `dataURL`）
- **Promise の扱い**: `Runtime.evaluate` の `awaitPromise: true` は効かず、Promise は `{}` で返る。`returnByValue:false` で評価し、結果が `className==='Promise'` なら `result.objectId` を `Runtime.awaitPromise {promiseObjectId, returnByValue:true}` に渡すと解決値が返る（`wk.cjs` の `evaluate` はこの方式。`async` 関数・`new Promise`・`invoke(...)` を待てる。reject は `ERR ...` として返る）。オブジェクトは `Runtime.callFunctionOn` で値に変換する
- `window.__TAURI_INTERNALS__.invoke` はメイン UI から呼べる。ACL があるため許可されていないコマンドは `Command <名前> not allowed by ACL` で拒否される（例: `plugin:window|close`、`get_app_version`）。許可済みのアプリ独自コマンドは動く（例: `relaunch_app` で再起動できた）
- 接続は使い終わったら閉じ、CLI は `process.exit` で確実に終了する（ライブラリで使うときも `close()` を呼ぶ）
- 非表示のカラム（スクロールで画面外など）に `shot` すると `Could not capture snapshot` になる

### 正常終了

`GDK_BACKEND=x11`（既定）で起動すると、`xwininfo -root -tree` に主窓が `"MultiColumnX": ("multicolumnx" "Multicolumnx")`、カラムが `"Tauri App": ("multicolumnx" ...)` の独立窓として座標付きで出る（ほかに 10x10 / 2x2 の `multicolumnx` ヘルパー窓が出ることがある。mutter のフレーム窓 `mutter-x11-frames` は対象外）。`linux-window.py close` が主窓だけに `WM_PROTOCOLS / WM_DELETE_WINDOW` の ClientMessage を送ると、約 1 秒でプロセスが消える（`linux-closewait.sh`）。Wayland ネイティブでは外部から正常終了させる手段が無い。

- アプリ本体が `WAYLAND_DISPLAY` の存在を見て `GDK_BACKEND=x11` を設定する（`src-tauri/src/main.rs`）ため、Wayland セッションでは `--wayland` で起動しても XWayland のままだった（`linux-window.py info` で X11 窓が見える）。実際のネイティブ Wayland で動かすにはアプリ側の変更が要る
- 終了時に `settings.json` の `appSettings.globalSettings.windowBounds.height` が増える（例: 1131 → 1168。X11 起動で再現。既知の不具合 #287 系の可能性）。diff は `--ignore-window-bounds` を使い、除外したことを結果に書く
- SIGTERM でも止められる（`kill -TERM <pid>`）。強制終了はしない

### スクリーンショット

- WebView 単位: `wk.cjs shot <対象> <png> [x y w h]`（メイン UI は主窓の中身、カラムは各カラムの中身が撮れる）
- 主窓の外枠: `linux-shot.sh <png>`（`import -window <id>`。XWayland 窓だけ。カラムは別窓なので黒く抜ける）。画面全体は `--root`
- Wayland のスクリーンショット（ポータルの許可ダイアログが出る）は自動化しない

### GTK ダイアログ（AT-SPI）

- python3 の `gi.repository.Atspi` でアプリ（`multicolumnx`）の AT-SPI ツリーが読める。**OS 設定（`gsettings org.gnome.desktop.interface toolkit-accessibility` = false）は変えずに動いた**: 試した環境のセッションに `GTK_MODULES=gail:atk-bridge` があり、アプリは `GNOME_ACCESSIBILITY` を付けなくても AT-SPI のデスクトップに現れた。この環境変数が無いセッションでの挙動は未確認（その場合はプロセス単位で `GTK_MODULES=gail:atk-bridge` などを渡す手があるが未検証。OS 設定は変えない）
- 主窓・カラム窓の `frame` の下に WebView の DOM は出ない（`filler` だけ）。DOM は `wk.cjs` を使う
- 保存ダイアログは `file chooser`（名前 `Save File`）として現れ、`名前(N)` ラベルの隣の `text` に既定ファイル名（例 `multi-column-x-<日付>.mcxbackup.json`）、`保存(S)` / `キャンセル(C)` ボタンがある。`linux-dialog.py save <フルパス>` は名前欄にフルパスを入れて保存ボタンを押す。バックアップの書き出し（設定 → バックアップ → 「バックアップを書き出す」）で保存とキャンセルの両方を確認した。ボタン名は UI 言語依存
- 取りこぼしやすい: ダイアログが開くまで数秒かかる。`info` を数秒ポーリングする

### 再起動・更新（L-03 / L-04 / L-07 / L-12 向け）

- `relaunch_app` はメイン UI の `invoke('relaunch_app')` で呼べる（ACL 許可済み）。旧プロセスが終了してから新プロセスが起動し、旧マウントは消えて新マウントが 1 つになる。新プロセスの親は systemd（`ps -o ppid`）。起動時の PID・`--pid-file` の中身は古くなるので `pgrep -x multicolumnx` で取り直す
- **環境変数は新プロセスに引き継がれる**: 新プロセスの `environ` に `WEBKIT_INSPECTOR_HTTP_SERVER=127.0.0.1:<port>` と `GDK_BACKEND=x11` が入る（`OWD` は呼び出し時の cwd、`APPIMAGE` は元の AppImage パス）。確認した範囲では旧プロセスの終了後に新プロセスが起動したため、**ポートの衝突は起きず、同じポートで再接続できた**（`wk.cjs targets` が新プロセスのターゲットを返す）。旧プロセスが終了に手間取る場合は衝突しうる（要確認）。再起動した直後の `wk.cjs` は接続が切れて `WebSocket エラー` になり、少し待って再接続する
- `linux-procs.sh maps <新pid> <旧マウント名>` が `一致=0` になることで「旧マウントを参照しない」を示す。旧マウント名は再起動前に `linux-procs.sh mounts` で控える
- L-12: `linux-procs.sh tree <pid>` で `WebKitWebProcess` を選び `linux-procs.sh kill <pid> <WebProcess の pid>` で落とすと、数秒以内に WebProcess の数が元に戻り、`wk.cjs targets` のターゲット数も保たれた（どのカラムが復旧したかの突き合わせは未確認）

## Android スクリプト（`scripts/android-device.sh`）

`ANDROID_SERIAL=emulator-5554 bash android-device.sh <コマンド>`。コマンド一覧はスクリプト先頭のコメントを参照（`state-save` / `state-restore` / `shot` / `find` / `tap-text` / `font-scale` / `night` / `rotate` / `net` / `install` / `start` / `stop` など）。

- 端末設定を変える前に**必ず** `state-save <file>`。終了時に `state-restore <file>` し、もう一度 `state-save` して記録と同じか確認する
- 機内モード: エミュレータでは機内モードだけでは遮断されない。`net off` は wifi / data も切る。試験後は `net on`（または `state-restore`）で必ず戻す
- 座標: `find <テキスト>` が中心座標を返す。`dump` の XML を直接読んでもよい。画面サイズや font_scale で座標が変わるので固定値にしない
- 画面確認: `shot <png>` を Read で開いて目視する
- 端末の言語切替・テーマはアプリ設定ではなく端末設定に従う項目（動画ダウンロード通知など）がある（`docs/development/android-notes.md`）
- リリースビルドで効く項目（ProGuard）はデバッグ APK では確認できない。その場合は「未実施（リリースビルド要）」とする

## 既知の落とし穴

- **heredoc 内のバックスラッシュは消える**ことがある（`<<EOF` 内の `` など）。Windows パスをスクリプトに書くときは `path.join(process.env.APPDATA, "com.natsuyasai.multicolumnx", …)` で組み立て、直書きしない
- **`win-appdata.ps1` の出力文字コード**: 現行は UTF-8 で出す。旧版や他の PowerShell スクリプトの出力は Shift-JIS で、リダイレクトすると invalid UTF-8 になる。読むときは `Get-Content -Encoding Default <ログ>`
- **スクラッチの appdata 退避は約 3GB になることがある**（EBWebView が大きい）。退避にはログイン情報（Cookie 等）が含まれるため、試験後に不要ならユーザーに確認したうえで削除する
- **試験対象ブランチの exe が古いことがある**: exe の更新時刻と HEAD のコミット時刻を比べ、古ければ再ビルドしてから試験する
- **アプリ起動中に退避・`settings.json` 編集をしない**: 事前に `tasklist` で `multicolumnx.exe` が無いことを確認する

- **vitest / prettier が `.claude/worktrees/` を拾う**: ワークツリーを作った状態で `npm test` / `prettier --check .` を回すと、そちらも走る。対象パスを明示するか、不要なワークツリーを片付ける
- **computer-use はビルド版 exe の許可が得られない**ことがある。Windows の操作は CDP 方式を使う（computer-use に頼らない）
- **auto mode の分類器がアプリ内の削除確定などのタップを拒否することがある**。ユーザーへ許可を求め、他のエージェントに代行させない（SKILL.md「分類器に拒否された場合」）
- `npm run tauri:build` は署名鍵が無く NSIS 段階で失敗するが、exe は生成される。更新時刻で最新か確認する
- 正常終了で主窓以外（tao のタイトル空 16x16 ヘルパー窓）に WM_CLOSE を送ると挙動が不安定になる
- Windows と Android を並行実施すると cargo ロック待ちが発生する。ロック待ちは異常ではない
- 起動中のアプリのデータはロックされうる。退避・復元は終了後に行う
- **`win-appdata.ps1 backup` は 2 分以上かかることがある**（EBWebView が大きい）。タイムアウトを長め（10 分）にするか、バックグラウンドで実行して完了通知を待つ
- **Git Bash で `git show <branch>:<path>` を使うときは `MSYS_NO_PATHCONV=1` が必要**（`:` 付きのパスが Windows パスに変換されて失敗する）。例: `MSYS_NO_PATHCONV=1 git show docs/xxx:.claude/skills/autonomous-manual-test/scripts/cdp.cjs`
- **スキルが未マージのブランチにある場合**（試験対象ブランチに `.claude/skills/autonomous-manual-test/` が無い）: `git show <スキルのブランチ>:<パス>` で読み出し、スクラッチへ書き出して使う。`.ps1` は **UTF-8 BOM が 1 つだけ**付いている必要がある（BOM なしだと Windows PowerShell 5.1 が日本語を文字化けさせ、BOM が二重だと先頭が `?<#` と解釈されて構文エラーになる）。**`git show` の出力には元の BOM が既に含まれる**ので、そのまま保存し、BOM を追加しない。保存後に先頭 3 バイトが `EF BB BF` の 1 つだけか確認する: `node -e "const b=require('fs').readFileSync(process.argv[1]);console.log(b.subarray(0,6).toString('hex'))" <ps1>`（`efbbbf3c23` で始まれば 1 つ。`efbbbfefbbbf` なら二重）

### Linux

- **`pkill -f <パターン>` は実行中シェル自身のコマンドラインにも一致して自分を殺す**（exit 144 になった）。起動時に PID を記録し、PID 指定で止める。`WebKitWebProcess` を名前で kill すると他アプリ（GNOME の他の WebKit アプリ）を巻き込む。試験対象の子孫だけを `/proc` の PPid で辿る（`linux-procs.sh`）
- **OOM**: `/tmp` の残骸（`.mount_*` / `appimage_extracted_*`、4.5GB の実績）とカラム 8 本が重なってメモリが枯渇し、デスクトップが落ちた。起動前に `free -h` と残骸を確認する（`linux-launch.sh` が表示する）。残骸は他の実行のものかもしれないので、削除はユーザーに確認する
- **AppImage 起動中は `/tmp/.mount_*` にマウントされる**。`linux-launch.sh` が返す PID はそのマウント上の `multicolumnx` 自身。AppImage ファイルを動かす試験は写しで行う
- **アプリ起動中に退避・復元をしない**（`linux-appdata.sh` が拒否する）。`restore-settings` は `settings.json` だけで、`settings.json.prev` は戻さない
- 終了時に `windowBounds` の高さが増える（上記「正常終了」）
- `/proc/<pid>/environ` は起動時の環境（アプリが実行中に `set_var` した値は見えないことがある）。実効のバックエンドは `linux-window.py info` で X11 窓が見えるかで判断する
- `wk.cjs eval` の式はシェルのクォートに注意（`$` やバッククォートはシングルクォートで囲む）。ページ内の `fetch` / `invoke` は Promise を返す式にすれば待てる
- 試験で作ったスクショ・バックアップファイル（個人情報を含むことがある）はスクラッチに置き、不要になったら削除する

## 結果記録の例

`tmp/plans/<日付>-<対象名>/integration-test.md` の結果セル:

```
Android: OK（font_scale 1.3。欄見出しが「テーマと表示サイズ」で二重に見えない） / Win: OK（日本語。H3 が「テーマと表示サイズ」。shots/set-ja-win.png）
```
