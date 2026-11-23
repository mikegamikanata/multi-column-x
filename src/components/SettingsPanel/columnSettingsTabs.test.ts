import { describe, expect, it } from "vitest";
import type { Column } from "@/types";
import {
  columnSettingsTabs,
  INITIAL_COLUMN_SETTINGS_TAB,
  LINE_LIST_ERROR_TAB,
} from "./columnSettingsTabs";

const pageTypes: Column["pageType"][] = [
  "home",
  "notifications",
  "search",
  "list",
  "custom",
];

describe("columnSettingsTabs", () => {
  it.each(pageTypes)(
    "%sカラムでは基本・表示・フィルタ・カスタムCSSの4つのタブがこの順で表示される",
    (pageType) => {
      expect(columnSettingsTabs({ pageType })).toEqual([
        "basic",
        "view",
        "filter",
        "css",
      ]);
    },
  );

  it("外部サイトカラムではタブを表示しない", () => {
    expect(columnSettingsTabs({ pageType: "external" })).toBeNull();
  });

  it("カラム設定を開いたときは基本タブが選ばれている", () => {
    expect(INITIAL_COLUMN_SETTINGS_TAB).toBe("basic");
  });

  it("入力エラーのときに切り替わる先はフィルタタブである", () => {
    expect(LINE_LIST_ERROR_TAB).toBe("filter");
  });
});
