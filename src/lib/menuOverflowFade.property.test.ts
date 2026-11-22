import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FADE_TOLERANCE_PX, getMenuFadeState } from "@/lib/menuOverflowFade";

const sizeArb = fc.integer({ min: 0, max: 5000 });

describe("getMenuFadeState プロパティ", () => {
  it("溢れ量が誤差以内なら scrollLeft によらず start も end も偽", () => {
    fc.assert(
      fc.property(
        sizeArb,
        sizeArb,
        fc.integer({ min: 0, max: 5000 }),
        (clientWidth, extra, scrollLeft) => {
          const scrollWidth = clientWidth + Math.min(extra, FADE_TOLERANCE_PX);
          expect(
            getMenuFadeState({ scrollLeft, scrollWidth, clientWidth }),
          ).toEqual({
            start: false,
            end: false,
          });
        },
      ),
    );
  });

  it("scrollLeft が 0 なら start は偽", () => {
    fc.assert(
      fc.property(sizeArb, sizeArb, (scrollWidth, clientWidth) => {
        expect(
          getMenuFadeState({ scrollLeft: 0, scrollWidth, clientWidth }).start,
        ).toBe(false);
      }),
    );
  });

  it("末尾まで到達していれば end は偽", () => {
    fc.assert(
      fc.property(
        sizeArb,
        sizeArb,
        fc.nat(100),
        (scrollWidth, clientWidth, over) => {
          const scrollLeft = Math.max(0, scrollWidth - clientWidth) + over;
          expect(
            getMenuFadeState({ scrollLeft, scrollWidth, clientWidth }).end,
          ).toBe(false);
        },
      ),
    );
  });

  it("溢れ量が誤差の 2 倍を超えるなら start と end の少なくとも一方は真", () => {
    fc.assert(
      fc.property(
        sizeArb,
        fc.integer({ min: FADE_TOLERANCE_PX * 2 + 1, max: 5000 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (clientWidth, overflow, ratio) => {
          const scrollWidth = clientWidth + overflow;
          const scrollLeft = overflow * ratio;
          const { start, end } = getMenuFadeState({
            scrollLeft,
            scrollWidth,
            clientWidth,
          });
          expect(start || end).toBe(true);
        },
      ),
    );
  });
});
