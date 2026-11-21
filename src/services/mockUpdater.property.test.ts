import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseMockUpdaterKind } from "./mockUpdater";

const KNOWN = [
  "available",
  "none",
  "check-error",
  "install-error",
  "slow-progress",
];

describe("parseMockUpdaterKind プロパティ", () => {
  it("任意の文字列に対し null か既知の種別を返し、非 null なら入力と等しい", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.constantFrom(...KNOWN)), (s) => {
        const r = parseMockUpdaterKind(s);
        if (r !== null) {
          expect(KNOWN).toContain(r);
          expect(r).toBe(s);
        } else {
          expect(KNOWN).not.toContain(s);
        }
      }),
    );
  });
});
