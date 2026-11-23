import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DEFAULT_GLOBAL_SETTINGS } from "../../types";
import { DRAFT_KEY_CATEGORY, dirtyCategories } from "./settingsCategories";
import { createSettingsDraft, type SettingsDraft } from "./settingsDraft";

type DraftKey = keyof SettingsDraft;

const initial = createSettingsDraft(DEFAULT_GLOBAL_SETTINGS);
const allKeys = Object.keys(DRAFT_KEY_CATEGORY) as DraftKey[];
const keyArb = fc.constantFrom(...allKeys);

/** 同じ型のまま、必ず異なる値へ変える（真偽は反転、数値・文字列は差分を足す） */
function differentValue(value: unknown, salt: number): unknown {
  if (typeof value === "boolean") return !value;
  if (typeof value === "number") return value + 1 + Math.abs(salt);
  return `${String(value)}#${Math.abs(salt)}`;
}

function changeKeys(
  base: SettingsDraft,
  keys: readonly DraftKey[],
  salt: number,
): SettingsDraft {
  const next: Record<string, unknown> = { ...base };
  for (const key of keys) next[key] = differentValue(base[key], salt);
  return next as unknown as SettingsDraft;
}

describe("dirtyCategories プロパティ", () => {
  it("任意の1キーを変更するとそのキーのカテゴリだけが含まれる", () => {
    fc.assert(
      fc.property(keyArb, fc.integer(), (key, salt) => {
        const changed = changeKeys(initial, [key], salt);
        const dirty = dirtyCategories(initial, changed);
        expect([...dirty]).toEqual([DRAFT_KEY_CATEGORY[key]]);
      }),
    );
  });

  it("任意のキー集合を変更すると、それらのカテゴリの集合と一致する", () => {
    fc.assert(
      fc.property(fc.subarray(allKeys), fc.integer(), (keys, salt) => {
        const changed = changeKeys(initial, keys, salt);
        const expected = new Set(keys.map((k) => DRAFT_KEY_CATEGORY[k]));
        expect(dirtyCategories(initial, changed)).toEqual(expected);
      }),
    );
  });

  it("任意のキー集合を変更してから元の値へ戻すと空集合になる", () => {
    fc.assert(
      fc.property(fc.subarray(allKeys), fc.integer(), (keys, salt) => {
        const changed = changeKeys(initial, keys, salt);
        const reverted = { ...changed } as Record<string, unknown>;
        for (const key of keys) reverted[key] = initial[key];
        expect(
          dirtyCategories(initial, reverted as unknown as SettingsDraft).size,
        ).toBe(0);
      }),
    );
  });

  it("下書きそのものと比較すると常に空集合になる", () => {
    fc.assert(
      fc.property(fc.subarray(allKeys), fc.integer(), (keys, salt) => {
        const draft = changeKeys(initial, keys, salt);
        expect(dirtyCategories(draft, draft).size).toBe(0);
      }),
    );
  });
});
