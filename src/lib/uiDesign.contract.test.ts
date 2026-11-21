import { describe, expect, it } from "vitest";
import {
  listModuleScssFiles,
  parseScss,
  readScss,
} from "@/test-utils/scssBlocks";
import type { ScssBlock } from "@/test-utils/scssBlocks";
import {
  checkAndroidMixins,
  checkAndroidTapTarget,
  checkBorderColor,
  checkDuration,
  checkFontSize,
  checkGrid,
  checkInteractiveStates,
  checkModuleScss,
  checkOutlineRemoval,
  checkReducedMotion,
  checkTokenGrid,
  formatViolation,
  type Violation,
} from "@/test-utils/uiDesignRules";

// 未移行のモジュール SCSS（項目2〜9の対象外）。移行したファイルをここから外し、最終段階で空にして定数ごと削除する。
const PENDING_MODULES: string[] = [
  "src/App.module.scss",
  "src/components/MobileTabBar/MobileTabBar.module.scss",
  "src/components/TopBar/TopBar.module.scss",
];

const migratedFiles = listModuleScssFiles().filter(
  (file) => !PENDING_MODULES.includes(file),
);

const blocksOf = (file: string): ScssBlock[] => parseScss(readScss(file), file);

const expectNoViolations = (violations: Violation[]) =>
  expect(violations.map(formatViolation)).toEqual([]);

describe("UIデザインの契約（共通基盤）", () => {
  it("共通トークンのスペーシングと角丸は0.25remの倍数である", () => {
    expectNoViolations(checkTokenGrid(readScss("src/styles/_tokens.scss")));
  });

  it("index.css が動きの軽減設定でtransitionとanimationを無効化している", () => {
    expectNoViolations(checkReducedMotion(readScss("src/index.css")));
  });

  it("Android用ミキシンは data-platform=android 配下にだけ宣言を持つ", () => {
    expectNoViolations(checkAndroidMixins(readScss("src/styles/_mixins.scss")));
  });
});

const perFileRules: [
  name: string,
  check: (blocks: ScssBlock[]) => Violation[],
][] = [
  ["寸法は0.25remの倍数でpxは1px以下だけである", (b) => checkGrid(b)],
  ["文字サイズは最小0.75remである", checkFontSize],
  ["動きの長さは150〜250msに収まる", checkDuration],
  [
    "押せる要素にhover・active・focus-visibleが定義されている",
    checkInteractiveStates,
  ],
  ["アウトラインを消していない", checkOutlineRemoval],
  ["入力欄と枠付きボタンの枠色が装飾用の色ではない", checkBorderColor],
  [
    "Androidの当たり判定が44px以上になる指定がある",
    (b) => checkAndroidTapTarget(b),
  ],
];

describe("UIデザインの契約（移行済みモジュールSCSS）", () => {
  it.each(perFileRules)("%s", (_name, check) => {
    expectNoViolations(migratedFiles.flatMap((file) => check(blocksOf(file))));
  });
});

describe("UIデザインの契約（未移行リストのラチェット）", () => {
  it("未移行リストに載っているファイルはすべて実在する", () => {
    const existing = listModuleScssFiles();
    expect(PENDING_MODULES.filter((file) => !existing.includes(file))).toEqual(
      [],
    );
  });

  it("未移行リストのファイルはどれも違反を持つ（違反ゼロなら未移行リストから外すこと）", () => {
    const clean = PENDING_MODULES.filter(
      (file) => checkModuleScss(blocksOf(file)).length === 0,
    );
    expect(clean, "違反が無いので PENDING_MODULES から外すこと").toEqual([]);
  });
});
