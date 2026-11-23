import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useUnsavedChangesGuard } from "./useUnsavedChangesGuard";

describe("useUnsavedChangesGuard", () => {
  it("未適用の変更がないときは確認を出さずに onClose を呼ぶ", () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => useUnsavedChangesGuard(false, onClose));

    act(() => result.current.requestClose());

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(result.current.confirmOpen).toBe(false);
  });

  it("未適用の変更があるときは onClose を呼ばず確認を表示する", () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => useUnsavedChangesGuard(true, onClose));

    act(() => result.current.requestClose());

    expect(onClose).not.toHaveBeenCalled();
    expect(result.current.confirmOpen).toBe(true);
  });

  it("確認で破棄を選ぶと確認を閉じて onClose を呼ぶ", () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => useUnsavedChangesGuard(true, onClose));
    act(() => result.current.requestClose());

    act(() => result.current.confirmDiscard());

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(result.current.confirmOpen).toBe(false);
  });

  it("確認で戻るを選ぶと onClose を呼ばず確認だけ閉じる", () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => useUnsavedChangesGuard(true, onClose));
    act(() => result.current.requestClose());

    act(() => result.current.cancelConfirm());

    expect(onClose).not.toHaveBeenCalled();
    expect(result.current.confirmOpen).toBe(false);
  });
});
