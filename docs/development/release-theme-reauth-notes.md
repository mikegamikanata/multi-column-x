# リリース・テーマ切替・再認証 開発ノート

スコープ外とした判断、リリース／自動更新の CI 構成、テーマ切替、更新進捗表示、更新後ダイアログ（WhatsNew）、再認証（Cookie 上書き）に関する実装時の設計判断・落とし穴を記録する。`architecture-overview.md` の「アップデート方式のセキュリティ」節は前提とし、ここでは重複しない補足知見のみを扱う。Android 固有の Cookie 関連知見は `android-notes.md` を参照。

## 意図的にスコープ外とした判断

- ヘッダーカスタマイズ用スクリプト（数百 KB の React バンドル）の軽量化は、inject アーキテクチャの再設計が必要になるため見送っている。
- IPC 定数の TS/Rust コード生成一本化も、契約テスト（fixture 比較）方式で十分と判断し見送っている。
- 設定の既定値は Rust `impl Default`（構造体レベル `#[serde(default)]`）を唯一の定義とし、キー欠落時も TS 側 `DEFAULT_GLOBAL_SETTINGS` / `DEFAULT_COLUMN_SETTINGS` と同じ値になることを契約テスト（`contracts/default-settings.json`）で保証している。`defaultScrollPosRestoreEnabled` は欠落時も新規インストール時と同じ `false`。

## リリース CI / 自動更新

- Windows/Linux の desktop ビルドジョブが同一 Release に更新用 JSON を書き込むため、両プラットフォーム分の情報が正しくマージされるかは構成変更のたびに要確認（ジョブの実行順序や生成方式次第で片方しか反映されない懸念がある）。
- Linux の自動更新対象は AppImage のみ（deb/rpm パッケージは Tauri updater 非対応）。
- リリース CI のデスクトップビルドは Windows と Linux のみ（macOS は対象外）。Windows のコード署名は行わない方針（SmartScreen 等の警告は許容している）。

## テーマ切替

- 色をトークン化する際は用途ベースで判断すること。同じ16進数値でも背景・境界・テキストなど用途が異なれば別トークンに割り当てる必要があり、機械的な文字列置換で済ませてはいけない。
- ベースラインの `:root` にダーク値をデフォルト設定することで、テーマ解決前の初期描画フラッシュを防止している（既定がダークであることに依存した設計）。
- `matchMedia` 非対応環境は `light` 指向にフォールバックし、不正な `theme` 値は `dark` にフォールバックする、という境界値仕様になっている。
- モバイル UI の白半透明色は、トークン化すると半透明の質感が失われるが「本体テーマとの統一を優先する」という明示的なトレードオフ判断をしている。
- Android の `themes.xml` はテーマ切替の対象外。
- カラム内 WebView（X 本体ページ）にも、アプリ設定パネルでテーマを変更して適用した瞬間に（`src/hooks/useSettingsApplyHandlers.ts` 経由）解決済みテーマ（dark/light、system は OS 配色の解決値）を全カラムの X 公式ページの `night_mode` Cookie（`WEBVIEW_SCRIPTS.applyNightModeCookie`）へ反映してリロードする。値が変化した場合のみリロードする。
- 配色は WCAG コントラスト基準（文字・アイコン 4.5:1、`border-strong` の輪郭 3:1）で設計しており、`src/lib/themeContrast.contract.test.ts` が全トークン×背景の組み合わせを検証する（`src/lib/contrast.ts` の `contrastRatio` を使用）。`text-disabled` と装飾の区切り線（`border` / `border-subtle`）は対象外。
- accent は文字・アイコン・枠用（`--mcx-accent`、ダークは明るい青 / ライトは濃い青）と、白文字を載せる塗り用（`--mcx-accent-fill`。`--mcx-accent-hover` はその hover 色）に分離している。白文字を載せる背景は `accent-fill` を使うこと（`accent` を背景にすると白文字が読めない）。
- Android `SwipeBarOverlayView.kt` の companion object の色定数は `index.css` のコピーで、`src/lib/swipeBarColors.contract.test.ts` が一致を検証する。トークンを変えたら Kotlin 側も更新すること。
- 活性状態の文字・アイコンを `opacity` で薄めると実効コントラストが下がるため、階調は `text-secondary` / `text-tertiary` / `text-muted` のトークンで表現する（無効状態・アニメーション・ドラッグ演出は除く）。

## 更新進捗表示

- Android（mobile）側は Kotlin から JS へのバイト単位進捗通知チャネルが無く、大改修になるため対象外と判断している。ダウンロード開始を1回通知するだけの簡易対応に留まっている。
- desktop 側は Tauri updater のイベントを進捗情報に変換し、再起動直前に専用の状態を追加通知する設計。
- リリースを作らずに更新を試験する手順・設計（UI モック / ローカル配信）は [updater-test-notes.md](updater-test-notes.md) を参照。

## 更新後ダイアログ（WhatsNew）の複数バージョン表示

更新後の初回起動で、前回起動バージョンより新しく今回バージョン以下のリリースノートを、新しい順に最大 3 件表示する（`src/lib/githubRelease.ts` の `fetchWhatsNewSelection` / `selectWhatsNewEntries`、`src/hooks/useWhatsNew.ts`、`src/components/WhatsNewDialog/`）。

- **一覧 API を 1 回だけ呼ぶ**: `GET {releasesApiBase()}?per_page=30` を 1 回呼び、範囲の絞り込み・降順ソート・先頭 3 件の切り出しはクライアントで行う。バージョンごとに `releases/tags/v…` を叩く方式は、飛ばしたバージョン数だけリクエストが増え、未認証の rate limit（60 回/時）を圧迫するため採らない。`per_page=30` は 3 件上限に対して、draft / prerelease / 本文空で除外される分を見込んだ余裕を持たせた値（API の既定値と同じ）。複数ページを辿る処理は持たない。
- **3 件上限と、省略の注記に件数を入れない理由**: 縦に長くなりすぎるのを避けるため上限は 3 件（`WHATS_NEW_MAX_ENTRIES`）。適格件数が 3 を超える（`hasMore`）ときは「それ以前の更新はリリースページで確認できる」旨を件数なしで注記する。一覧は 1 ページ分しか取得しないため、範囲全体の正確な件数は分からない（30 件を超えて遡る場合は注記の件数が嘘になる）。
- **除外条件**: `draft` / `prerelease` は一般ユーザーへ公開された更新ではないため除外する。本文が空または空白のみのリリースは表示しても意味が無いので飛ばし、**上限の 3 件にも数えない**（空のリリースが続いても表示枠を食わない）。
- **リリースページへのリンクを開く手段**: 既存の opener プラグイン（`@tauri-apps/plugin-opener` の `openUrl`）を使い、新規 Rust コマンドは作らない。コマンドを増やすと `build.rs` の `AppManifest`・capability・`generate_handler!` の同期が必要になる割に、やることが「URL を既定ブラウザで開く」だけのため。呼び出しは `src/services/releasePage.ts` の `openReleasePage()` に集約し、固定 URL（`RELEASES_PAGE_URL`）・引数なしにしている。
- **ACL だけでは「リリースページ以外は開けない」を強制できない**: `src-tauri/capabilities/default.json` に `opener:allow-open-url`（許可 URL は `https://github.com/natsuyasai/multi-column-x/releases` の 1 件）を足しているが、`main` ウィンドウは `column-webview.json`（`windows` に `"main"` を含み、`local` 既定 true）経由で既に `opener:default` / `opener:allow-default-urls`（http / https / mailto / tel の汎用 open）を持つ。権限は加算されるため、`default.json` のスコープ付き許可は追加の付与にすぎず、ACL としては任意の http(s) URL を開ける状態のままである。「開く先はリリースページだけ」は `openReleasePage` が URL を受け取らない（コード側）ことで担保している。`acl_contract.rs` の契約テストが検査するのは `default.json` 単体（opener の許可がリリース一覧 URL だけであること）で、ウィンドウ全体の実効権限ではない。実機（`tauri dev`）での opener 呼び出しの動作確認は未確認。
- **見出し階層**: ダイアログ `h2`（タイトル）→ 版ごとの `h3` → リリース本文内の `##` / `###` は `h4` に落とす。複数版を並べると本文内見出しが版見出しと同じ階層に並び、どこからどこまでが 1 つの版か分からなくなるため。版ごとに `<section>` で包む。
- **リンクの配置と実装**: リンクは `.notes`（スクロール領域）の外、閉じるボタンの上に置く。本文が長くスクロールしても、省略注記とリンクには常に到達できる。要素は `<a href={RELEASES_PAGE_URL}>` ＋ `onClick` で `preventDefault()` してから `onOpenReleasePage()` を呼ぶ。`href` を持たせるのは、リンクとしてのアクセシブルネーム・フォーカス・URL の確認（コピー）を保つため。`preventDefault` は、WebView 内でリリースページへ遷移してアプリの画面が置き換わるのを防ぐため。
- 試験用サーバー（`scripts/updater-test`）が一覧エンドポイントを配信する点は [updater-test-notes.md](updater-test-notes.md) を参照。

## 再認証（既存アカウントの Cookie 上書き）

- **旧実装の問題**: 再認証は既存アカウントの `dataDirectory` を再利用してログイン画面を開いていたため、既存 Cookie が残った状態になり、実質「新規ログイン」になっていなかった。バグというより設計不備として発見された。
- **新設計の核心**: 空の一時プロファイル／一時 `dataDirectory` で完全に新規のログインを行い、Cookie による同一性照合を行った上で、一致または初回（未登録）の場合のみ対象アカウントへ上書きコミットする。不一致・失敗・キャンセル時は元セッションを一切変更せず温存する。
- desktop はストア上の `dataDirectory` を差し替えて WebView 群を再生成するだけで新セッションに切り替わる（カラムは常にアカウントの `dataDirectory` を参照する設計のため）。旧ディレクトリの削除は、Windows の WebView2 がウィンドウ生存中プロファイルフォルダをロックするため、ウィンドウを閉じた後にベストエフォートで実行する（失敗しても致命的ではなく、孤児ディレクトリの残留を許容する設計）。
- JNI シグネチャ変更を避ける工夫として、一時プロファイル ID は Kotlin 内部で生成し、既存の呼び出しインタフェースのシグネチャ自体は変更していない。これにより ProGuard keep ルールの追加同期を回避している。
- 再認証まわりを触る際は、次の3点の方針を前提として踏まえること。
  - mobile 側の一時プロファイルの後始末: `AddAccount.kt` の `finishReauthWithSentinel` が `WebViewProfiles.deleteProfile` で削除するが、使用中などの失敗は握りつぶすベストエフォート実装であり、「確実な」後始末は意図的に目指していない（desktop の孤児ディレクトリ許容と同じ設計判断）。
  - Cookie クリアの非同期完了待ち: `commitReauthCookies`（`AddAccount.kt`）は `cm.removeAllCookies { ... }` のコールバック内で新しい Cookie の `setCookie` / `flush` を行っており、クリア完了を待ってから注入する実装になっている。
  - desktop 側の新ディレクトリ削除リトライ: `delete_account_data`（`src-tauri/src/commands/account.rs`）自体は `retry_with_delay` で最大5回・200ms間隔のリトライを行う。さらに再認証で不要になったディレクトリ（キャンセル・取得失敗・不一致時の新ディレクトリ、成功時の旧ディレクトリ）を消す `startReauth` 内の `deleteDataDirectory`（`src/hooks/useAccounts.ts`）は、失敗時に `logError` した上で `addPendingDataDirectoryDeletion` により `pendingDataDirectoryDeletions`（保留キュー）へ積む。通常のアカウント削除（`confirmRemoval`）と同じく、設定画面の「データフォルダの削除を再実行」から再試行できる。
- `startReauth` の構造: ウィンドウ結果の待ち受けはモジュールレベルの `waitForReauthWindowOutcome`、プラットフォーム別の処理は `startReauth` 内のローカル関数 `reauthOnMobile` / `reauthOnDesktop` と、desktop の照合結果を反映する `applyDesktopReauthResult` に分かれている。`isReauthingRef` による再入ガードは例外時にも解除される。
