# UI デザイン原則 設計ノート

アプリ UI にデザイン原則（視覚的階層・Hick・ゲシュタルト・Fitts・WCAG・8pt グリッド・認知心理・視覚デザイン・UX・a11y）を適用するための設計判断（ADR）。実際に UI を書くときのチェックリストと手順は `.claude/skills/ui-design-principles/SKILL.md` を参照。

> 状態: 段階 0（docs のみ）。`src/styles/_tokens.scss` / `_mixins.scss`、`src/hooks/useRestoreFocus.ts`、`src/test-utils/scssBlocks.ts`、`src/test-utils/a11y.ts`、`src/lib/uiDesign.contract.test.ts` は**段階 1 以降で作る予定**で、この時点では存在しない。

## 1. 原則を「アプリ向けに翻訳」した理由

元になる原則集は LP（ランディングページ）を想定しており、最大幅 1100px の中央寄せ、セクション間 64〜96px、60-30-10 配色、ファーストビュー最適化、12 カラムグリッドなどを含む。本アプリは TweetDeck スタイルの高密度デスクトップ / Android UI で、すでに次の資産がある。

- テーマ変数（`--mcx-*`）と、そのコントラスト契約テスト（`themeContrast.contract.test.ts`）
- rem 寸法と UI 表示サイズ（`<html>` の font-size で倍率を変える。`ui-scale-notes.md`）
- ネイティブ WebView の bounds と連動する固定バー高さ（`gridLayout.ts`）

そのため原則をそのまま適用せず、既存の仕組みと衝突しない形に翻訳した。LP 向け項目は対象外とし、固定バー高さ・本文 16px 化・配色トークンの全面刷新・カラム WebView 内（x.com）は**やらない**。翻訳表の全文は SKILL.md を参照。

主な翻訳の理由:

- **Fitts（44px）は Android のみ**: 固定バー（TopBar / ColumnHeader）は WebView の bounds と連動しており、高さを変えるとネイティブ側の配置・契約テストの更新が必要になる。Android には TopBar / ColumnHeader は出ず、MobileTabBar は 3.5rem で既に 44px を超える。desktop はマウス操作で密度を維持した方が価値が高いので、`[data-platform="android"]` 限定の上書きにした。
- **8pt グリッドは 0.25rem（4px）の倍数**: 既存コードが 0.25rem 刻みを多用しており、8px 刻みに揃えると見た目の変化が大きすぎる。倍率は rem で変わるので「4px の倍数」は基準倍率（16px）での値。
- **最小文字 12px**: 本文の 16px 化はしない（密度が落ちるため）。使うサイズを 6 段階に集約するだけにとどめる。

## 2. トークンを SCSS 変数にした理由

共通トークン（スペーシング・角丸・フォントサイズ・時間・タップ領域）は CSS カスタムプロパティではなく **SCSS 変数**（`src/styles/_tokens.scss`、予定）で定義する。

- Storybook は `src/index.css` を読み込まないため、`var(--mcx-space-*)` のようなカスタムプロパティは Story で未定義になる。
- SCSS 変数はビルド時にリテラル化されるので Story でも効き、契約テストが値を直接検証できる。
- 既存の SCSS 内取り決め（`$topbar-row-height` 等）とも一貫する。

SCSS から使うときは `@use "../../styles/tokens" as t;` / `@use "../../styles/mixins" as m;`（相対パス。sass では `@/` エイリアスを使わない）。

## 3. 契約テストと `PENDING_MODULES` 方式

契約テスト `src/lib/uiDesign.contract.test.ts`（予定）は全 `*.module.scss` を対象にするが、一度に全ファイルを直すと差分が大きくなる。そこで**未移行ファイルを `PENDING_MODULES`（相対パスの配列）に列挙して除外**し、段階ごとに移行したファイルをリストから外していく。最終段階でリストを空にし、定数ごと削除して「リストが空であること」の項目を足す。これにより各段階で全緑を保ちながら、移行済みファイルの退行を防げる。

例外（固定バー高さなど規則から外れる宣言）は**契約テストの定数**（`GRID_EXEMPT` / `ANDROID_TAP_EXEMPT`）に「ファイル・セレクタ・値・理由」付きで集約する。スタイルファイル側にコメントで散在させない。

契約テストの補助として、SCSS をセレクタ・宣言に分解する最小パーサ `src/test-utils/scssBlocks.ts`（予定。通常の TDD で先に単体テストを書く）を使う。

## 4. フォーカスリング方針

- `src/index.css` に `:where(a, button, input, ...):focus-visible` のグローバル既定を追加する（予定）。`:where()` は詳細度 0 なので、コンポーネント側の指定が常に勝つ。取りこぼしの保険という位置づけ。
- コンポーネント側は `&:focus-visible { @include m.focus-ring; }` を**明示**する。Storybook は `index.css` を読まないため、グローバルだけに頼ると Story でフォーカスリングが再現できず、play function でも検証できない。
- リングの色は `--mcx-accent`（既に全背景で 4.5:1 検証済み）。`outline: none` 単独の記述は原則禁止。`&:focus` + `outline: none` は `&:focus-visible` + `focus-ring` に置換する。
- マウスクリックではリングを出さず、キーボード操作でのみ出す（`:focus-visible` を使う理由）。
- グローバル既定を足すときは `:root[data-theme]` の色トークンブロックに**宣言を足さない**。`themeContrast` / `swipeBarColors` の契約テストが最初の `}` までをパースするため、ブロックの**後**に書く。

## 5. Android のみ 44px にする理由

- 操作要素の当たり判定を 2.75rem（44px、推奨 3rem）以上にするのは Android だけ。`[data-platform="android"]` 限定の上書き（ミキシン `android-tap-target`、予定）で実現する。`_dialog-fullscreen.scss` と同じ `:global([data-platform="android"]) &` 方式。
- 理由は前述のとおり、固定バーの高さがネイティブ bounds と連動しており変更できないことと、desktop の操作密度を維持するため。
- チェックボックス / ラジオ / トグルは `label` 全体に適用し、`input` 自体は拡大しない（見た目が崩れるため）。
- `ANDROID_TAP_EXEMPT`（desktop 専用の TopBar / ColumnHeader / SortableColumnGroups、インライン内リンクなど）は理由必須。

## 6. ダイアログ a11y

共通フック `src/hooks/useRestoreFocus.ts`（予定）は、マウント時の `document.activeElement` を覚え、アンマウント時に（DOM に残っていれば）フォーカスを戻す。ダイアログには `role="dialog"` / `aria-modal="true"` / `aria-labelledby`（`useId()` による見出し id）を付け、Esc で閉じる（`useEscapeKey`）。**フォーカストラップと `<dialog>` 要素化は実装しない**（挙動変更が大きく要求外）。

## 7. 不採用案

- CSS カスタムプロパティでのスペーシング: Storybook で未定義になる。
- Storybook の `preview.tsx` で `index.css` を読み込む: `html,body{overflow:hidden;height:100%}` で Story のレイアウトが崩れる。
- 固定バー高さの拡大: bounds 連動・契約テスト更新が必要で、要求外。
- フォーカストラップ / 全ダイアログの `<dialog>` 化: 挙動変更が大きく要求外。
- `src/App.css`: どこからも import されていない Vite テンプレートの残骸（`outline: none` が残っているが無効）。**触らない**。

## 8. 関連ファイル

- スキル: `.claude/skills/ui-design-principles/SKILL.md`
- 既存: `docs/development/ui-scale-notes.md`（rem・Android 全画面ダイアログ）、`src/lib/gridLayout.ts` と `gridLayout.contract.test.ts`、`src/lib/themeContrast.contract.test.ts`、`src/styles/_dialog-fullscreen.scss`
- 予定（段階 1 以降）: `src/styles/_tokens.scss`、`src/styles/_mixins.scss`、`src/hooks/useRestoreFocus.ts`、`src/test-utils/scssBlocks.ts`、`src/test-utils/a11y.ts`、`src/lib/uiDesign.contract.test.ts`
