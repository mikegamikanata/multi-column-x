import { describe, expect, it } from "vitest";
import { getMenuFadeState } from "@/lib/menuOverflowFade";

describe("getMenuFadeState", () => {
  it("すべて収まるときは start も end も偽", () => {
    expect(
      getMenuFadeState({ scrollLeft: 0, scrollWidth: 300, clientWidth: 300 }),
    ).toEqual({
      start: false,
      end: false,
    });
  });

  it("先頭にいて続きがあるときは end のみ真", () => {
    expect(
      getMenuFadeState({ scrollLeft: 0, scrollWidth: 600, clientWidth: 300 }),
    ).toEqual({
      start: false,
      end: true,
    });
  });

  it("末尾までスクロールしたときは start のみ真", () => {
    expect(
      getMenuFadeState({ scrollLeft: 300, scrollWidth: 600, clientWidth: 300 }),
    ).toEqual({
      start: true,
      end: false,
    });
  });

  it("途中までスクロールしたときは start も end も真", () => {
    expect(
      getMenuFadeState({ scrollLeft: 100, scrollWidth: 600, clientWidth: 300 }),
    ).toEqual({
      start: true,
      end: true,
    });
  });

  it("溢れ量が誤差 1px 以内なら start も end も偽", () => {
    expect(
      getMenuFadeState({ scrollLeft: 0, scrollWidth: 301, clientWidth: 300 }),
    ).toEqual({
      start: false,
      end: false,
    });
  });

  it("サブピクセルのスクロール量（0.5px）では start は偽", () => {
    expect(
      getMenuFadeState({ scrollLeft: 0.5, scrollWidth: 600, clientWidth: 300 }),
    ).toEqual({
      start: false,
      end: true,
    });
  });

  it("末尾との差がサブピクセル（0.5px）なら end は偽", () => {
    expect(
      getMenuFadeState({
        scrollLeft: 299.5,
        scrollWidth: 600,
        clientWidth: 300,
      }),
    ).toEqual({
      start: true,
      end: false,
    });
  });

  it("溢れ量が誤差を 1px 超えたら先頭では end が真", () => {
    expect(
      getMenuFadeState({ scrollLeft: 0, scrollWidth: 302, clientWidth: 300 }),
    ).toEqual({
      start: false,
      end: true,
    });
  });

  it("スクロール量がちょうど誤差 1px なら start は偽", () => {
    expect(
      getMenuFadeState({ scrollLeft: 1, scrollWidth: 600, clientWidth: 300 })
        .start,
    ).toBe(false);
  });

  it("末尾との差がちょうど誤差 1px なら end は偽", () => {
    expect(
      getMenuFadeState({ scrollLeft: 299, scrollWidth: 600, clientWidth: 300 })
        .end,
    ).toBe(false);
  });
});
