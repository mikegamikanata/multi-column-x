import { describe, expect, it } from "vitest";
import { nextTabIndex } from "./tabListKeyboard";

describe("nextTabIndex", () => {
  it("横並びでは右矢印で次のタブへ移動する", () => {
    expect(nextTabIndex(4, 1, "ArrowRight", "horizontal")).toBe(2);
  });

  it("横並びでは左矢印で前のタブへ移動する", () => {
    expect(nextTabIndex(4, 2, "ArrowLeft", "horizontal")).toBe(1);
  });

  it("縦並びでは下矢印で次、上矢印で前のタブへ移動する", () => {
    expect(nextTabIndex(4, 1, "ArrowDown", "vertical")).toBe(2);
    expect(nextTabIndex(4, 2, "ArrowUp", "vertical")).toBe(1);
  });

  it("末尾で次へ進むと先頭へ折り返す", () => {
    expect(nextTabIndex(4, 3, "ArrowRight", "horizontal")).toBe(0);
  });

  it("先頭で前へ戻ると末尾へ折り返す", () => {
    expect(nextTabIndex(4, 0, "ArrowLeft", "horizontal")).toBe(3);
  });

  it("Homeで先頭、Endで末尾のタブへ移動する", () => {
    expect(nextTabIndex(4, 2, "Home", "horizontal")).toBe(0);
    expect(nextTabIndex(4, 1, "End", "vertical")).toBe(3);
  });

  it("移動に関係しないキーでは移動しない", () => {
    expect(nextTabIndex(4, 1, "Enter", "horizontal")).toBeNull();
  });

  it("向きと異なる矢印キーでは移動しない", () => {
    expect(nextTabIndex(4, 1, "ArrowDown", "horizontal")).toBeNull();
    expect(nextTabIndex(4, 1, "ArrowUp", "horizontal")).toBeNull();
    expect(nextTabIndex(4, 1, "ArrowLeft", "vertical")).toBeNull();
    expect(nextTabIndex(4, 1, "ArrowRight", "vertical")).toBeNull();
  });

  it("タブが0件のときは移動しない", () => {
    expect(nextTabIndex(0, 0, "ArrowRight", "horizontal")).toBeNull();
    expect(nextTabIndex(0, 0, "Home", "horizontal")).toBeNull();
  });

  it("現在位置が一覧に無いとき（-1）は次へで先頭に移動する", () => {
    expect(nextTabIndex(4, -1, "ArrowRight", "horizontal")).toBe(0);
  });
});
