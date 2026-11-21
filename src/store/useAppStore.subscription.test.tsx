import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "./useAppStore";

// zustand の購読・部分更新・同期更新の振る舞いを固定する特性テスト。
// ライブラリ更新時に selector 購読や setState のマージ挙動が変わっていないことを検出する。
describe("useAppStore の購読と状態更新", () => {
  beforeEach(() => {
    useAppStore.setState({ isMobile: false, unreadCounts: {} });
  });

  it("selector で購読したフックは選択した値が変わったときだけ再描画される", () => {
    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount += 1;
      return useAppStore((s) => s.isMobile);
    });
    const initialRenderCount = renderCount;

    // 選択していない状態の更新では再描画されない
    act(() => {
      useAppStore.getState().setUnreadCount("col-1", 3);
    });
    expect(renderCount).toBe(initialRenderCount);
    expect(result.current).toBe(false);

    // 選択した値の更新では再描画され、新しい値が返る
    act(() => {
      useAppStore.getState().setIsMobile(true);
    });
    expect(result.current).toBe(true);
    expect(renderCount).toBe(initialRenderCount + 1);
  });

  it("setState は部分更新として既存のほかの状態を保持したままマージする", () => {
    useAppStore.setState({ unreadCounts: { "col-1": 2 } });

    useAppStore.setState({ isMobile: true });

    const state = useAppStore.getState();
    expect(state.isMobile).toBe(true);
    expect(state.unreadCounts).toEqual({ "col-1": 2 });
    expect(typeof state.setIsMobile).toBe("function");
  });

  it("関数形式の更新は直前の状態を受け取り同期的に反映される", () => {
    const before = useAppStore.getState().reloadAllSignal;

    act(() => {
      useAppStore.getState().bumpReloadAllSignal();
      useAppStore.getState().bumpReloadAllSignal();
    });

    expect(useAppStore.getState().reloadAllSignal).toBe(before + 2);
  });

  it("subscribe のリスナーは新旧の状態を受け取り状態が同一のままなら呼ばれない", () => {
    const listener = vi.fn();
    const unsubscribe = useAppStore.subscribe(listener);

    // 現在の状態オブジェクトそのものを渡す更新は変更なしとして通知されない
    useAppStore.setState(useAppStore.getState());
    expect(listener).not.toHaveBeenCalled();

    useAppStore.setState({ isMobile: true });
    expect(listener).toHaveBeenCalledTimes(1);
    const [next, prev] = listener.mock.calls[0];
    expect(next.isMobile).toBe(true);
    expect(prev.isMobile).toBe(false);

    unsubscribe();
    useAppStore.setState({ isMobile: false });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("引数なしのフックはストア全体を購読しどの状態の更新でも再描画される", () => {
    const { result } = renderHook(() => useAppStore());

    act(() => {
      useAppStore.getState().setUnreadCount("col-9", 5);
    });

    expect(result.current.unreadCounts["col-9"]).toBe(5);
  });
});
