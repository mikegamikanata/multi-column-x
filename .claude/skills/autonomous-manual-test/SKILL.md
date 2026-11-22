---
description: "フェーズ6の後、integration-test.md の手動テスト項目のうちエージェントが自律実施できるものを実機（Windows の CDP / Android エミュレータ）で実施し、結果を記録する"
user-invocable: true
argument-hint: "対象の integration-test.md のパス（省略時は現在のブランチの tmp/plans/*/integration-test.md）"
---

# 自律手動テスト（フェーズ6.5）

`integration-test-viewpoints`（フェーズ6）が出力した `integration-test.md` のうち、**エージェントが安全に実施できる項目は毎回エージェントが実施し、結果セルに記録する**。人間のテスターには、自律実施できなかった項目（と判断が要る項目）だけが残る状態にする。

スクリプトの使い方・実機操作のコツ・落とし穴は `reference.md` を参照。スクリプトは `scripts/` にある。試験対象のブランチにこのスキルが無い（未マージ）場合は、`reference.md` の「既知の落とし穴」の手順で `git show` から読み出して使う。

## 使うタイミング

- フェーズ6で `integration-test.md` を出力した直後、`superpowers:finishing-a-development-branch` の前
- 挙動不変のリファクタ・docs・CI のみの変更で `integration-test.md` が無い場合は対象外

## 対象外（このスキルでは扱わない）

- TalkBack など支援技術を使う項目、macOS の項目 → 「未実施（人間が実施）」のまま残す
- Linux の項目 → 末尾「Linux（未整備）」参照。ユーザーが追記するまでは未実施のまま残す

## 1. 項目の振り分け（安全ルール）

各項目を読み、**自律実施 / 実施しない** に分ける。迷ったら実施しない。

### 実施してよい

- アプリ内 UI の表示・操作の確認（設定画面、ダイアログ、テーマ、表示言語、表示サイズ、カラム追加画面など）
- X の**閲覧**、および動画の取得（ダウンロード・保存ダイアログ操作）
- アプリ自身がテスト用に追加したデータ（テスト用カラム・テスト用に作ったプリセットなど）の追加・変更・削除
- 端末設定の変更（Android の font_scale・テーマ・回転・機内モード・表示言語）。**試験前の値を記録し、必ず戻す**

### 実施しない（禁止）

- **X への外部影響操作**: 投稿・返信・いいね・リポスト・フォロー・ブロック・ミュート・DM・プロフィール変更など、X のアカウント状態を変える操作
- **OS のシステム設定変更**（DPI、OS の表示言語・テーマ、ネットワーク設定など。Android エミュレータの端末設定は上記の許可範囲のみ）
- **既存のカラム・アカウント・プリセットの削除や上書き**（削除系はテスト用に追加したデータだけ）
- ユーザーの実データを壊しうる操作（バックアップ復元の実行、設定の初期化など）。実施する場合は退避済みのデータに対してだけ行い、その旨を結果に書く
- TalkBack 等の支援技術、macOS、Linux の操作

### 分類器に拒否された場合

auto mode の分類器が、アプリ内の削除確定などのタップを拒否することがある。その場合は**ユーザーに許可を求める**。他のエージェント（サブエージェント含む）やスクリプトに代行させて回避しない。許可が得られなければ「未実施（権限により中断）」と記録する。

### 代替手順

該当するデータが無いなどで手順どおり実施できない場合（例: 動画ツイートが TL に無い、再生できる投稿が無い）は、**同じ期待結果を確認できる代替手順**で実施してよい。ただし結果セルに「代替: 〇〇で確認」と必ず明記する。代替でも期待結果を確認できないなら「未実施」にして理由を書く。

## 2. 実施手順

1. **準備**
   - **退避前に、アプリ（`multicolumnx.exe`）が起動していないことを `tasklist /FI "IMAGENAME eq multicolumnx.exe"` で確認する**（起動中なら正常終了させてから退避する）
   - 試験前のデータを退避する。Windows: `win-appdata.ps1 backup`（2 分以上かかることがある。タイムアウトを長めに、バックグラウンド実行推奨）。Android: `android-device.sh state-save`。退避先は**スクラッチ（リポジトリ外の一時ディレクトリ）**
   - **試験対象ブランチの exe が古くないか確認する**: exe の更新時刻（`(Get-Item src-tauri/target/release/multicolumnx.exe).LastWriteTime`）と HEAD のコミット時刻（`git log -1 --format=%ci`）を比べ、exe のほうが古ければ再ビルドする
   - ビルド: Windows は `npm run tauri:build`（署名鍵が無く NSIS 段階で失敗するが exe は `src-tauri/target/release/multicolumnx.exe` に生成される。exe の更新時刻で確認する）。Android は `npm run tauri:android:build -- --debug --apk --target x86_64` → `android-device.sh install <apk>`（`adb install -r` でログイン状態を維持）
   - Windows と Android を並行実施する場合、cargo のビルドロックを待つことがある。同時に走らせず順に起動する（ロック待ちは異常ではない）
2. **起動**: Windows は `win-launch.ps1`（CDP 有効）→ `cdp.cjs pages` で接続確認。Android は `android-device.sh start`
3. **操作と検証**
   - テスト用カラムの追加・削除は `col-add-ext.cjs` / `col-close.cjs`、アプリ終了中の `settings.json` 編集は `settings-edit.cjs`（`reference.md`）
   - ポップアップ / コンポーズなどを実クリックで開けないときは `open.cjs`（invoke で開く）を代替手順として使える（`reference.md`）
   - Windows は CDP（`cdp.cjs`）で DOM を読む・操作する。メイン UI は `http://tauri.localhost/`、カラムはアカウントごとの別ポート。OS ネイティブの保存ダイアログは `win-dialog.ps1`、画面は `win-shot.ps1`
   - Android は `android-device.sh`（`tap-text` / `find` で座標特定、`shot` で画面確認）
   - **見た目だけでなく DOM・設定値・ファイルなどの客観的な根拠**を 1 項目につき 1 つ以上取る（例: 計算済みスタイル、`settings.json` の値、保存されたファイルのサイズ）
   - 1 項目ごとに結果を判定する。期待結果と違えば **NG** とし、再現手順と根拠を残す（勝手に直さず、メインへ報告する）
4. **証拠の保存**: スクリーンショットと実行ログは**スクラッチ**（`tmp/` も不可。リポジトリ配下に置かない）へ。結果セルにはファイル名か短い根拠を書く。コミットしない
5. **結果記録**: `integration-test.md` の**該当セルだけ**を最小限に編集する（他の行・他セルは触らない。並行して別エージェントが同じファイルを編集している場合があるため、編集前に必ず読み直す）。書式:
   - `Win: OK（根拠）` / `Android: OK（根拠）` を結果セルの前置きにする。例: `Android: OK（font_scale 1.3。…） / Win: OK（日本語。…。win-test/shots/set-ja-win.png）`
   - NG は `Win: NG（現象・根拠）`、実施しない項目は `未実施（理由）` と書く
   - 代替手順を使ったら `代替: …` を明記する
6. **後片付け**（必ず実施。失敗しても飛ばさない）
   - アプリを正常終了する: Windows は `win-closewait.ps1`（`win-window.ps1 close` で主窓にだけ WM_CLOSE を送り、プロセス消滅を待って経過時間を出す。タイトル空の 16x16 ヘルパー窓には送らない）。残ったプロセスは最後の手段としてだけ強制終了する
   - Windows: `win-appdata.ps1 diff` で `settings.json` が退避時と同一か意味比較し（差分のキーのパスが出る。`windowBounds` だけの差は `-IgnoreWindowBounds` で除外。`windowBounds` は client サイズで保存されるので `win-window.ps1 info` の client 値と比べる）、意図しない差分があれば `restore-settings` で戻す。テスト用に追加したカラム等が残っていないことも確認する
   - Android: 端末設定を `state-restore` で戻し、`state-save` し直して記録と一致することを確認する。機内モードにしたなら必ず解除する
   - 一時ファイル（保存した動画、退避データ）はスクラッチ内に限り、リポジトリに混ぜない
7. **報告**: 実施した項目数・OK/NG/未実施の内訳、NG の詳細、代替手順を使った項目、分類器に拒否された項目、後片付けの確認結果（settings.json の一致、端末設定の復元）を報告する

## 3. サブエージェントへの委譲

CLAUDE.md の規則どおり、実機操作は判断を伴うため **`model: sonnet`** のサブエージェントに委譲する（ビルドやコマンド実行だけの機械的な作業は `haiku` でもよい）。`Agent` 委譲の前に「メイン=<モデル名> / サブエージェント=<モデル名>」を出力する。

委譲プロンプトに必ず入れる項目:

- 対象の `integration-test.md` の絶対パスと、実施対象の項目 ID（Win / Android それぞれ）
- 検証するブランチ・ビルド手順・exe / APK のパス
- このスキルの「安全ルール」（実施する・しない）全文、またはこのスキルを読むよう指示
- スクラッチのパス（退避・証拠の保存先）、Android の serial（例 `emulator-5554`）
- 結果セルの書式（`Win: OK（根拠）` 等）と「該当セルだけ最小限に編集」
- 分類器に拒否されたらユーザーへ確認を求め、代行させない、という指示
- コミットしない（結果の `integration-test.md` は `tmp/` 配下でコミット対象外）。コミットが必要な作業を含めるなら、トレーラーはメインが指定した文字列をそのまま使う
- 判断に迷ったら止まらず、報告に「要確認」と書いて進める

## 4. 禁止事項

- 安全ルールの「実施しない」操作を、ユーザーの明示許可なしに行うこと
- 後片付け（データ・端末設定の復元）をせずに報告すること
- 実施していない項目に OK を書くこと、根拠のない OK を書くこと
- 証拠や退避データをリポジトリ内に置く・コミットすること

## Linux（未整備）

ユーザーが Linux 環境で追記する予定の節。現時点の既知情報のみ:

- Linux ではカラムが独立 `WebviewWindow` で、クリッピングは `linux_column_layout` が制御する（`docs/development/linux-column-spec.md`、`docs/development/linux-webview-notes.md`）
- WebKitGTK のため WebView2 の CDP 方式は使えない。接続方法・スクリーンショット・ダイアログ操作は未確定
- Linux の項目はこのスキルでは実施せず、`integration-test.md` では「未実施（人間が実施）」のままにする
