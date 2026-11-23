import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleAndroidBack,
  installAndroidBackBridge,
  registerBackHandler,
} from "./androidBackHandler";

const unregisters: Array<() => void> = [];
const register = (handler: () => boolean) => {
  const unregister = registerBackHandler(handler);
  unregisters.push(unregister);
  return unregister;
};

afterEach(() => {
  unregisters.splice(0).forEach((u) => u());
  delete window.__mcxHandleBack;
});

describe("androidBackHandler", () => {
  it("戻る操作を処理する画面が無いときは画面側で処理されない", () => {
    expect(handleAndroidBack()).toBe(false);
  });

  it("ハンドラが処理したときは処理されたものとして扱われる", () => {
    const handler = vi.fn(() => true);
    register(handler);
    expect(handleAndroidBack()).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("後から登録したハンドラが優先される", () => {
    const first = vi.fn(() => true);
    const second = vi.fn(() => true);
    register(first);
    register(second);
    handleAndroidBack();
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it("falseを返すハンドラは次のハンドラに委ねる", () => {
    const first = vi.fn(() => true);
    const second = vi.fn(() => false);
    register(first);
    register(second);
    expect(handleAndroidBack()).toBe(true);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
  });

  it("すべてのハンドラがfalseなら処理されなかったものとして扱われる", () => {
    register(() => false);
    register(() => false);
    expect(handleAndroidBack()).toBe(false);
  });

  it("登録解除したハンドラは呼ばれない", () => {
    const handler = vi.fn(() => true);
    const unregister = register(handler);
    unregister();
    expect(handleAndroidBack()).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it("installAndroidBackBridgeでネイティブから呼べる入口が公開される", () => {
    const handler = vi.fn(() => true);
    register(handler);
    expect(window.__mcxHandleBack).toBeUndefined();
    installAndroidBackBridge();
    expect(window.__mcxHandleBack?.()).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
