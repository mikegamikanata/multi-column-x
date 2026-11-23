import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { nextTabIndex, type TabListOrientation } from "./tabListKeyboard";

const orientationArb = fc.constantFrom<TabListOrientation>(
  "horizontal",
  "vertical",
);

const keyArb = fc.oneof(
  fc.constantFrom(
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "Home",
    "End",
  ),
  fc.string(),
);

// count >= 1 と、その範囲内の current を組にして生成する
const countAndCurrentArb = fc
  .integer({ min: 1, max: 200 })
  .chain((count) =>
    fc.tuple(fc.constant(count), fc.integer({ min: 0, max: count - 1 })),
  );

const keysOf = (orientation: TabListOrientation) =>
  orientation === "horizontal"
    ? { prev: "ArrowLeft", next: "ArrowRight", other: ["ArrowUp", "ArrowDown"] }
    : {
        prev: "ArrowUp",
        next: "ArrowDown",
        other: ["ArrowLeft", "ArrowRight"],
      };

describe("nextTabIndex プロパティ", () => {
  it("結果は null か 0 以上 count 未満の整数になる", () => {
    fc.assert(
      fc.property(
        countAndCurrentArb,
        keyArb,
        orientationArb,
        ([count, current], key, orientation) => {
          const result = nextTabIndex(count, current, key, orientation);
          if (result !== null) {
            expect(Number.isInteger(result)).toBe(true);
            expect(result).toBeGreaterThanOrEqual(0);
            expect(result).toBeLessThan(count);
          }
        },
      ),
    );
  });

  it("次へ移動したあとに前へ移動すると元の位置に戻る", () => {
    fc.assert(
      fc.property(
        countAndCurrentArb,
        orientationArb,
        ([count, current], orientation) => {
          const { prev, next } = keysOf(orientation);
          const moved = nextTabIndex(count, current, next, orientation);
          expect(moved).not.toBeNull();
          expect(nextTabIndex(count, moved as number, prev, orientation)).toBe(
            current,
          );
        },
      ),
    );
  });

  it("前へ移動したあとに次へ移動すると元の位置に戻る", () => {
    fc.assert(
      fc.property(
        countAndCurrentArb,
        orientationArb,
        ([count, current], orientation) => {
          const { prev, next } = keysOf(orientation);
          const moved = nextTabIndex(count, current, prev, orientation);
          expect(moved).not.toBeNull();
          expect(nextTabIndex(count, moved as number, next, orientation)).toBe(
            current,
          );
        },
      ),
    );
  });

  it("向きに対応しない矢印キーでは移動しない", () => {
    fc.assert(
      fc.property(
        countAndCurrentArb,
        orientationArb,
        fc.integer({ min: 0, max: 1 }),
        ([count, current], orientation, i) => {
          const key = keysOf(orientation).other[i];
          expect(nextTabIndex(count, current, key, orientation)).toBeNull();
        },
      ),
    );
  });

  it("矢印キーと Home / End 以外の任意のキーでは移動しない", () => {
    const handled = new Set([
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Home",
      "End",
    ]);
    fc.assert(
      fc.property(
        countAndCurrentArb,
        orientationArb,
        fc.string().filter((k) => !handled.has(k)),
        ([count, current], orientation, key) => {
          expect(nextTabIndex(count, current, key, orientation)).toBeNull();
        },
      ),
    );
  });

  it("Home は先頭、End は末尾へ移動する", () => {
    fc.assert(
      fc.property(
        countAndCurrentArb,
        orientationArb,
        ([count, current], orientation) => {
          expect(nextTabIndex(count, current, "Home", orientation)).toBe(0);
          expect(nextTabIndex(count, current, "End", orientation)).toBe(
            count - 1,
          );
        },
      ),
    );
  });

  it("count が 0 以下なら常に null になる", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -200, max: 0 }),
        fc.integer({ min: -200, max: 200 }),
        keyArb,
        orientationArb,
        (count, current, key, orientation) => {
          expect(nextTabIndex(count, current, key, orientation)).toBeNull();
        },
      ),
    );
  });
});
