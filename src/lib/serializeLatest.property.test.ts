import fc from "fast-check";
import { describe, it, expect } from "vitest";
import { serializeLatest } from "@/lib/serializeLatest";

/** 操作列: "call" = 実行を要求 / "finish" = 実行中の 1 件を完了 */
const opsArb = fc.array(fc.constantFrom("call", "finish"), { maxLength: 40 });

/** 実行を手動で完了できる fn を作り、操作列を流し込む。 */
function setup() {
  const resolvers: Array<() => void> = [];
  let concurrent = 0;
  let maxConcurrent = 0;
  let started = 0;
  const fn = (): Promise<void> => {
    concurrent += 1;
    started += 1;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    return new Promise<void>((resolve) => {
      resolvers.push(() => {
        concurrent -= 1;
        resolve();
      });
    });
  };
  const run = serializeLatest(fn);
  const flush = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };
  return {
    run,
    flush,
    finishOne: async () => {
      const resolve = resolvers.shift();
      if (resolve) resolve();
      await flush();
    },
    hasRunning: () => resolvers.length > 0,
    stats: () => ({ maxConcurrent, started }),
  };
}

describe("serializeLatest プロパティ", () => {
  it("任意の操作列で同時実行数は常に1以下である", async () => {
    await fc.assert(
      fc.asyncProperty(opsArb, async (ops) => {
        const t = setup();
        for (const op of ops) {
          if (op === "call") void t.run();
          else await t.finishOne();
        }
        while (t.hasRunning()) await t.finishOne();
        expect(t.stats().maxConcurrent).toBeLessThanOrEqual(1);
      }),
    );
  });

  it("最後の呼び出しより後に開始した実行が必ず1回ある", async () => {
    await fc.assert(
      fc.asyncProperty(opsArb, async (ops) => {
        const t = setup();
        let startedBeforeLastCall: number | null = null;
        for (const op of ops) {
          if (op === "call") {
            startedBeforeLastCall = t.stats().started;
            void t.run();
          } else {
            await t.finishOne();
          }
        }
        while (t.hasRunning()) await t.finishOne();
        // 待機中の呼び出しは即時開始、実行中の呼び出しは完了後に開始されるため、
        // どちらでも最後の呼び出し時点より後に少なくとも 1 回開始されている。
        if (startedBeforeLastCall === null) return;
        expect(t.stats().started).toBeGreaterThan(startedBeforeLastCall);
      }),
    );
  });

  it("fnの実行回数は呼び出し回数以下である", async () => {
    await fc.assert(
      fc.asyncProperty(opsArb, async (ops) => {
        const t = setup();
        for (const op of ops) {
          if (op === "call") void t.run();
          else await t.finishOne();
        }
        while (t.hasRunning()) await t.finishOne();
        const calls = ops.filter((o) => o === "call").length;
        expect(t.stats().started).toBeLessThanOrEqual(calls);
      }),
    );
  });
});
