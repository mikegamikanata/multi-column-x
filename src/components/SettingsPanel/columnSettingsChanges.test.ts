import { describe, expect, it } from "vitest";
import type { ColumnSettings } from "../../types";
import {
  hasColumnSettingsChanges,
  type ColumnSettingsFormState,
} from "./columnSettingsChanges";

const baseSettings: ColumnSettings = {
  autoReloadEnabled: false,
  autoReloadInterval: 600,
  showCountdown: true,
  hideHeaderEnabled: false,
  hideTweetInputEnabled: false,
  showCustomMenu: false,
  scrollPosRestoreEnabled: false,
  customCSS: "",
  visibleLinks: [],
  smallImageEnabled: false,
  smallImageWidth: "50%",
  blurImageEnabled: false,
  blurImageAmount: "10px",
  ngWords: [],
  repostHiddenUserIds: [],
  whitelistEnabled: false,
  whitelistWords: [],
  returnToLastReadEnabled: false,
};

const initial: ColumnSettingsFormState = {
  settings: baseSettings,
  width: 350,
  labelText: "",
  lineListTexts: { ngWords: "", repostHiddenUserIds: "", whitelistWords: "" },
};

describe("hasColumnSettingsChanges", () => {
  it("初期値と同じ内容なら変更なしと判定する", () => {
    expect(
      hasColumnSettingsChanges(initial, {
        ...initial,
        settings: { ...baseSettings },
        lineListTexts: { ...initial.lineListTexts },
      }),
    ).toBe(false);
  });

  it("設定値が変わっていれば変更ありと判定する", () => {
    expect(
      hasColumnSettingsChanges(initial, {
        ...initial,
        settings: { ...baseSettings, autoReloadInterval: 120 },
      }),
    ).toBe(true);
  });

  it("片方にしかないキーも差分として検出する", () => {
    const { ngWords: _removed, ...withoutNgWords } = baseSettings;
    expect(
      hasColumnSettingsChanges(initial, {
        ...initial,
        settings: withoutNgWords as ColumnSettings,
      }),
    ).toBe(true);
  });

  it("幅が変わっていれば変更ありと判定する", () => {
    expect(hasColumnSettingsChanges(initial, { ...initial, width: 400 })).toBe(
      true,
    );
  });

  it("表示名が変わっていれば変更ありと判定する", () => {
    expect(
      hasColumnSettingsChanges(initial, { ...initial, labelText: "仕事用" }),
    ).toBe(true);
  });

  it("行リストの入力テキストが変わっていれば変更ありと判定する", () => {
    expect(
      hasColumnSettingsChanges(initial, {
        ...initial,
        lineListTexts: { ...initial.lineListTexts, ngWords: "foo" },
      }),
    ).toBe(true);
  });
});
