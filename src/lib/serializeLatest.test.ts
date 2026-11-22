import { describe, it, expect, vi } from "vitest";
import { serializeLatest } from "@/lib/serializeLatest";

/** 手動で完了・失敗を制御できる Promise。 */
function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("serializeLatest", () => {
  it("待機中に呼ぶと即座に1回実行される", () => {
    const fn = vi.fn(() => Promise.resolve());
    const run = serializeLatest(fn);

    void run();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("実行中に複数回呼ぶと完了後に1回だけ実行される", async () => {
    const first = deferred();
    const fn = vi
      .fn<() => Promise<void>>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(undefined);
    const run = serializeLatest(fn);

    void run();
    void run();
    void run();
    expect(fn).toHaveBeenCalledTimes(1);

    first.resolve();
    await vi.waitFor(() => expect(fn).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("実行中に呼んだ呼び出し元は2回目の実行の完了まで待たされる", async () => {
    const first = deferred();
    const second = deferred();
    const fn = vi
      .fn<() => Promise<void>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const run = serializeLatest(fn);

    void run();
    const settled = vi.fn();
    const waiting = run().then(settled);

    first.resolve();
    await vi.waitFor(() => expect(fn).toHaveBeenCalledTimes(2));
    expect(settled).not.toHaveBeenCalled();

    second.resolve();
    await waiting;
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it("実行が失敗しても保留中の実行は行われる", async () => {
    const first = deferred();
    const fn = vi
      .fn<() => Promise<void>>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(undefined);
    const run = serializeLatest(fn);

    const firstCall = run().catch(() => {});
    const second = run();

    first.reject(new Error("失敗"));
    await firstCall;
    await second;
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("実行が失敗するとその実行を待つ呼び出し元にエラーが伝わる", async () => {
    const first = deferred();
    const second = deferred();
    const fn = vi
      .fn<() => Promise<void>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const run = serializeLatest(fn);

    const firstCall = run();
    const pendingCall = run();
    const firstResult = expect(firstCall).rejects.toThrow("1回目の失敗");
    const pendingResult = expect(pendingCall).rejects.toThrow("2回目の失敗");

    first.reject(new Error("1回目の失敗"));
    await vi.waitFor(() => expect(fn).toHaveBeenCalledTimes(2));
    second.reject(new Error("2回目の失敗"));

    await firstResult;
    await pendingResult;
  });

  it("cancelすると保留中の実行は行われず呼び出し元は待ちっぱなしにならない", async () => {
    const first = deferred();
    const fn = vi
      .fn<() => Promise<void>>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(undefined);
    const run = serializeLatest(fn);

    void run();
    const pendingCall = run();
    run.cancel();

    await pendingCall;
    first.resolve();
    await first.promise;
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("cancel後に呼ぶと再び実行される", async () => {
    const first = deferred();
    const fn = vi
      .fn<() => Promise<void>>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(undefined);
    const run = serializeLatest(fn);

    void run();
    void run();
    run.cancel();
    first.resolve();
    await first.promise;
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(1);

    await run();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("fnが同期的に例外を投げても後続の呼び出しは実行される", async () => {
    const fn = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => {
        throw new Error("同期例外");
      })
      .mockResolvedValue(undefined);
    const run = serializeLatest(fn);

    await expect(run()).rejects.toThrow("同期例外");
    await run();

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("2回目の実行中にさらに呼ぶと完了後にもう1回実行される", async () => {
    const first = deferred();
    const second = deferred();
    const fn = vi
      .fn<() => Promise<void>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockResolvedValue(undefined);
    const run = serializeLatest(fn);

    void run();
    void run();
    first.resolve();
    await vi.waitFor(() => expect(fn).toHaveBeenCalledTimes(2));

    const third = run();
    expect(fn).toHaveBeenCalledTimes(2);
    second.resolve();
    await third;

    expect(fn).toHaveBeenCalledTimes(3);
  });
});
