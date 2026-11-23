import { renderHook } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTabListKeyboard } from "./useTabListKeyboard";

const IDS = ["a", "b", "c"] as const;
type Id = (typeof IDS)[number];

function keyEvent(key: string) {
  const preventDefault = vi.fn();
  const event = { key, preventDefault } as unknown as React.KeyboardEvent;
  return { event, preventDefault };
}

function setup(
  current: Id,
  orientation: "horizontal" | "vertical" = "horizontal",
) {
  const onSelect = vi.fn();
  const { result } = renderHook(() =>
    useTabListKeyboard<Id>({
      ids: IDS,
      current,
      orientation,
      onSelect,
      elementId: (id) => `tab-${id}`,
    }),
  );
  return { onKeyDown: result.current, onSelect };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useTabListKeyboard", () => {
  it("右矢印で次のタブを選択する", () => {
    const { onKeyDown, onSelect } = setup("a");
    onKeyDown(keyEvent("ArrowRight").event);
    expect(onSelect).toHaveBeenCalledWith("b");
  });

  it("移動に使うキーではブラウザ既定の動作（スクロール等）を止める", () => {
    const { onKeyDown } = setup("a");
    const { event, preventDefault } = keyEvent("ArrowRight");
    onKeyDown(event);
    expect(preventDefault).toHaveBeenCalled();
  });

  it("移動先のタブ要素にフォーカスを移す", () => {
    document.body.innerHTML =
      '<button id="tab-a"></button><button id="tab-b"></button><button id="tab-c"></button>';
    const { onKeyDown } = setup("a");
    onKeyDown(keyEvent("ArrowRight").event);
    expect(document.activeElement?.id).toBe("tab-b");
  });

  it("縦並びでは下矢印で次、上矢印で前のタブを選択し、折り返す", () => {
    const down = setup("c", "vertical");
    down.onKeyDown(keyEvent("ArrowDown").event);
    expect(down.onSelect).toHaveBeenCalledWith("a");
    const up = setup("a", "vertical");
    up.onKeyDown(keyEvent("ArrowUp").event);
    expect(up.onSelect).toHaveBeenCalledWith("c");
  });

  it("移動に関係しないキーでは選択もpreventDefaultもしない", () => {
    const { onKeyDown, onSelect } = setup("a");
    const { event, preventDefault } = keyEvent("Enter");
    onKeyDown(event);
    expect(onSelect).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
