# 設定画面のナビゲーション 開発ノート

アプリ設定（`AppSettingsPanel`）のサイドナビ（Android は一覧→詳細）、カラム設定（`SettingsPanel`）のタブ分割、Android の端末の戻る操作に関する設計判断（ADR）を記録する。

## 対象ファイル

- `src/components/AppSettingsPanel/settingsCategories.ts` — カテゴリ定義・分類・表示条件・下書きキー割当・未適用判定
- `src/components/AppSettingsPanel/AppSettingsPanel.tsx` / `SettingsCategoryNav.tsx` / `SettingsCategoryList.tsx` — アプリ設定の画面
- `src/components/SettingsPanel/columnSettingsTabs.ts` / `SettingsPanel.tsx` — カラム設定のタブ
- `src/lib/tabListKeyboard.ts` / `src/hooks/useTabListKeyboard.ts` — 矢印 / Home / End のキー移動（サイドナビとカラム設定のタブで共用）
- `src/lib/androidBackHandler.ts` / `src/hooks/useAndroidBackHandler.ts` / `src/App.tsx` — Android の戻る操作（画面側）
- `src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/MainActivity.kt` / `MainPageBack.kt` — Android の戻る操作（ネイティブ側）

## 背景

アプリ設定は上部タブ 5 つ + 「一般」タブ内の 6 グループ・約 20 セクションの縦並び、カラム設定は最大 10 セクションの縦並びで、目的の設定までのスクロールが長く、分類も 2 段（タブ + グループ見出し）で混在していた。これをカテゴリ単位のページ切替に整理した。

## アプリ設定の設計

### カテゴリ定義の唯一の場所

カテゴリの ID・分類（一般 / カラム / データ・拡張 / アプリ）・並び順・適用方式（`draft` / `own` / `instant`）・環境ごとの表示条件（`visibleCategories`）は **`settingsCategories.ts` にだけ**書く。ナビ・一覧・フッターは、この定義を描画するだけにする（SRP。純粋関数なので単体テストできる）。カテゴリを足す・並べ替える・出し分けを変えるときはここと辞書（`settings:panel.categories.*`）だけを触る。

- 適用方式: `draft` = 共有下書き＋フッターの「キャンセル / 適用」、`own` = ページ内で適用（カラム配置）、`instant` = 操作時点で反映（フッターは「閉じる」のみ）。
- 開くと毎回「表示」から始まる（`INITIAL_CATEGORY`）。

### 下書きキーのカテゴリ割当を `Record` で強制する

未適用の印を付けるため、`SettingsDraft` の全キーがどのカテゴリに属するかを `DRAFT_KEY_CATEGORY: Record<keyof SettingsDraft, DraftCategoryId>` で持つ。`Record` にしているのは、**下書きにキーを足したのに割当を忘れる**とコンパイルエラーになり、印が付かない設定が生まれないようにするため。下書きに項目を足したら必ずここに割当を追加すること。

### 未適用判定は値比較

`dirtyCategories(initial, draft)` は、初期下書き（`createSettingsDraft(settings)`）と現在の下書きをキー単位で `Object.is` 比較し、異なるキーが属するカテゴリの集合を返す。**値を元に戻すと印が消える**（仕様）。

### ページ切替はアクティブなカテゴリだけを描画する

非アクティブなカテゴリはアンマウントする。下書きは `AppSettingsPanel` の state にあるため、アンマウントしても編集中の値は保持される（カテゴリを切り替えても値は消えない）。

### 入力エラー時の切替先

NGワード / リポスト非表示ユーザーの入力エラー（`VALIDATION_ERROR_CATEGORY` = 閲覧・フィルタ）があると適用せず、そのカテゴリ（Android は詳細画面）に切り替えてエラーを表示し、ナビ（一覧）にエラーの印を付ける。エラーを直して適用すると印は消える。

### 環境で非表示のカテゴリの値は失われない

Android では「プリセット」、デスクトップでは「Android専用」などが表示されないが、下書きは全キーを持つので、適用しても非表示カテゴリの値は保存値のまま残る（適用時に非表示カテゴリのキーを落とさない）。

### アクセシビリティ

- サイドナビは分類見出しを含むため `role="tablist"` にせず、`<nav aria-label>` 内に `<h3>` と `<ul>` のボタンを置く。選択中は `aria-current="page"`、roving tabindex。
- 未適用・エラーの印は、視覚用の `aria-hidden` の記号＋スクリーンリーダー用の非表示テキスト（「未適用の変更あり」「入力エラーあり」）。
- 上下矢印 / Home / End でカテゴリを移動できる（移動と同時にそのカテゴリを表示）。ロジックは `nextTabIndex`（`tabListKeyboard.ts`）で、カラム設定のタブ（左右矢印）と共用する。

### Android は一覧→詳細の 2 階層

全画面のまま「カテゴリ一覧（分類ごと・説明付き）→ 詳細（ヘッダーに戻るボタン＋カテゴリ名）」とする。開くと一覧から。一覧に未適用の印・エラー印を出し、未適用の変更（またはエラー）があるときだけフッターに「キャンセル / 適用」を出す。入力エラー時は「閲覧・フィルタ」の詳細に切り替わる。

## カラム設定のタブ

- タブ: 基本（カラム・自動更新・通知）/ 表示（表示・画像・画像ブラー）/ フィルタ（NGワード・リポスト非表示・ホワイトリスト）/ カスタム CSS。定義は `columnSettingsTabs.ts`。WAI-ARIA tabs パターン（`role="tablist"` / `tab` / `tabpanel`、roving tabindex）。
- **外部サイトカラム（`pageType === "external"`）はタブを出さない**（`columnSettingsTabs` が `null` を返す）。項目がカラム・カスタム CSS しか無く、タブにすると操作が増えるだけのため、1 ページで表示する。自動更新は `isAutoReloadSupported` が external / list を対象外にしているため、外部サイトカラムでは出ない（現状どおり）。
- 開くと毎回「基本」から。入力エラー（NGワード / リポスト非表示 / ホワイトリスト）で適用できないときは「フィルタ」タブに切り替え、タブにエラー印を付ける。「再読み込み / キャンセル / 適用」は従来どおり。

## 未適用の変更があるときの閉じる前の確認

- アプリ設定・カラム設定とも、未適用の変更があるときに **ヘッダーの ✕ / Esc キー / フッターの「閉じる」（アプリ設定の非 draft カテゴリ）** で閉じようとすると確認（「破棄して閉じる」/「戻る」、`variant="danger"`）を出す。共通フック `useUnsavedChangesGuard`（`src/hooks/`）と確認ダイアログ部品 `UnsavedChangesDialog` を使う。
- 未適用の判定は、アプリ設定は `dirtyCategories`（ナビの印と同じ）、カラム設定は `columnSettingsChanges.ts` の `hasColumnSettingsChanges`（開いたときの設定・幅・表示名・行リスト入力と比較）。値を元に戻せば確認は出ない。
- 「キャンセル」は破棄の意思が明確なので確認しない。パネル内の操作による自動クローズ（全WebView再生成・プリセット読込・バックアップ復元・カラム配置の適用・カラム設定の再読み込み）も確認しない。
- `useEscapeKey` は document の keydown を各コンポーネントが個別に購読するため、ConfirmDialog の Esc と二重に発火する。**確認表示中はパネル側の Esc ハンドラを無効にする**こと（Esc で確認だけ閉じる）。

## Android の戻る操作

アプリ設定の詳細画面表示中に端末の戻る操作をしたとき、設定を閉じずにカテゴリ一覧へ戻す（下書きは保持）。

### 処理順（`MainActivity.handleOnBackPressed`）

1. ポップアップが開いていれば最前面を閉じる（画面側への問い合わせより前）
2. メイン画面（React）に問い合わせる: `window.__mcxHandleBack()` を `evaluateJavascript`（`MAIN_PAGE_BACK_SCRIPT`）で呼び、結果が `"true"` なら画面側で処理済みとして終了
3. 処理されなければ従来処理（`handleNativeBack`）: アクティブカラムの履歴を戻る → それも無ければ `moveTaskToBack(true)`（バックグラウンドへ）

一覧表示中や設定を開いていないときは、画面側のハンドラが登録されていないので `false` が返り、従来処理になる。`mainWebView` がまだ無いとき（起動直後）も従来処理にする。

### 画面側（ブリッジとハンドラ登録）

- `androidBackHandler.ts` がハンドラの登録簿を持ち、後から登録したものを優先して順に呼ぶ（true を返したものが処理した扱い）。`installAndroidBackBridge()` が `window.__mcxHandleBack` に入口を公開する。`App.tsx` が `isMobile` のとき 1 回呼ぶ。
- 各画面は `useAndroidBackHandler(enabled, handler)` で登録する（`enabled` の間だけ登録し、ハンドラは ref 経由で最新を参照するので再レンダーで登録順が変わらない）。アプリ設定は `isMobile && mobileDetail !== null` のとき詳細→一覧に戻す。**他の画面でも戻る操作を横取りしたいときはこのフックで登録する**（`MainActivity` を触る必要は無い）。
- ネイティブ側の判定は `MainPageBack.kt` の純粋関数（`isBackConsumedByMainPage`: `"true"` だけが処理済み。`null` / `"null"` / 例外 / 引用付き文字列などは未処理）に切り出して JVM 単体テストしている。JS 側は例外時も `false` を返す。

### `WryActivity` を編集せず `onWebViewCreate` でメイン WebView を受け取る理由

メイン WebView への問い合わせには `MainActivity` がメイン WebView の参照を持つ必要がある。`WryActivity.kt`（`generated/`）は Tauri の自動生成ファイル（"DO NOT MODIFY"）で、再生成で変更が消える。`WryActivity` は WebView 生成時に `open fun onWebViewCreate(webView: WebView)` を呼ぶフックを用意しているので、`MainActivity` でこれをオーバーライドして `mainWebView` に保持する。カラム / ポップアップの WebView は別管理なので、ここで受け取るのはメイン画面のものだけ。

### ProGuard の変更が不要な理由

`proguard-rules.pro` の keep ルールが必要なのは、Rust（JNI）が文字列でメソッド名を指定して呼ぶものだけ（`android_bridge.rs` → `MainActivity` のメソッド）。`onWebViewCreate` は `WryActivity`（Kotlin）が通常の仮想呼び出しで呼ぶだけで、`MainActivity` のメソッドシグネチャも Rust 側から呼ばれる集合も変えていない。`window.__mcxHandleBack` は JS の識別子で、R8 の対象外。

## 不採用案

- **全カテゴリを描画して `hidden` で隠す** — DOM が重くなり、テストが「隠れているのに見つかる」状態になるため不採用。アクティブだけ描画する（下書きは親の state なので値は保持される）。
- **未適用判定を「触ったかどうか」のフラグで持つ** — 値を元に戻しても印が消えず、実際の差分と食い違うため不採用。初期下書きとの値比較にした。
- **設定検索** — カテゴリ分割でスクロール量が減ること自体が目的で、項目数も検索が必要なほどではないため見送り。必要になったら別途検討する。
- **開いたカテゴリ / タブの位置の記憶** — 開くたびに同じ場所（「表示」/「基本」）から始まるほうが予測しやすく、記憶に伴う状態管理（保存先・無効値の扱い）が増えるため不採用。
- **戻る操作でアプリ設定・カラム設定そのものを閉じる** — 今回の対象は詳細→一覧のみ。一覧表示中はネイティブの既定動作に任せる。
