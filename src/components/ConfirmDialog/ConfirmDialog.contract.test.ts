import { describe, expect, it } from "vitest";
import { parseScss, readScss } from "@/test-utils/scssBlocks";

const blocks = parseScss(
  readScss("src/components/ConfirmDialog/ConfirmDialog.module.scss"),
  "ConfirmDialog.module.scss",
);

function declared(selector: string, prop: string): string | undefined {
  return blocks
    .find((b) => b.selector === selector)
    ?.declarations.find((d) => d.prop === prop)?.value;
}

describe("ConfirmDialog の危険操作ボタンの配色", () => {
  it("危険操作の確定ボタンはダークとライトの両テーマで読める配色になる", () => {
    // danger / danger-bg の 4.5:1 は themeContrast.contract.test.ts が両テーマで保証している。
    // ここでは確定ボタンがそのトークンの組を使い続けていることを固定する
    expect(declared(".dangerBtn", "color")).toBe("var(--mcx-danger)");
    expect(declared(".dangerBtn", "background")).toBe("var(--mcx-danger-bg)");
    expect(declared(".dangerBtn", "border")).toContain("var(--mcx-danger)");
  });
});
