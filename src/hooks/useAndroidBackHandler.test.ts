import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { handleAndroidBack } from "@/lib/androidBackHandler";
import { useAndroidBackHandler } from "./useAndroidBackHandler";

describe("useAndroidBackHandler", () => {
  it("有効な間は戻る操作でハンドラが呼ばれる", () => {
    const handler = vi.fn(() => true);
    const { unmount } = renderHook(() => useAndroidBackHandler(true, handler));
    expect(handleAndroidBack()).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("無効な間は戻る操作でハンドラが呼ばれない", () => {
    const handler = vi.fn(() => true);
    const { unmount } = renderHook(() => useAndroidBackHandler(false, handler));
    expect(handleAndroidBack()).toBe(false);
    expect(handler).not.toHaveBeenCalled();
    unmount();
  });

  it("無効化されるとハンドラが解除される", () => {
    const handler = vi.fn(() => true);
    const { rerender, unmount } = renderHook(
      ({ enabled }) => useAndroidBackHandler(enabled, handler),
      { initialProps: { enabled: true } },
    );
    rerender({ enabled: false });
    expect(handleAndroidBack()).toBe(false);
    expect(handler).not.toHaveBeenCalled();
    unmount();
  });

  it("アンマウントするとハンドラが解除される", () => {
    const handler = vi.fn(() => true);
    const { unmount } = renderHook(() => useAndroidBackHandler(true, handler));
    unmount();
    expect(handleAndroidBack()).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it("再レンダーで渡したハンドラが最新のものとして呼ばれる", () => {
    const first = vi.fn(() => true);
    const second = vi.fn(() => true);
    const { rerender, unmount } = renderHook(
      ({ handler }) => useAndroidBackHandler(true, handler),
      { initialProps: { handler: first } },
    );
    rerender({ handler: second });
    handleAndroidBack();
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    unmount();
  });

  it("再レンダーしても登録順は入れ替わらず後から登録したものが優先される", () => {
    const lower = vi.fn(() => true);
    const upper = vi.fn(() => true);
    const a = renderHook(() => useAndroidBackHandler(true, lower));
    const b = renderHook(() => useAndroidBackHandler(true, upper));
    a.rerender();
    handleAndroidBack();
    expect(upper).toHaveBeenCalledTimes(1);
    expect(lower).not.toHaveBeenCalled();
    a.unmount();
    b.unmount();
  });

  it("毎回新しい関数を渡して再レンダーしても登録順は入れ替わらない", () => {
    const lower = vi.fn(() => true);
    const upper = vi.fn(() => true);
    const a = renderHook(() => useAndroidBackHandler(true, () => lower()));
    const b = renderHook(() => useAndroidBackHandler(true, upper));
    a.rerender();
    handleAndroidBack();
    expect(upper).toHaveBeenCalledTimes(1);
    expect(lower).not.toHaveBeenCalled();
    a.unmount();
    b.unmount();
  });
});
