import { describe, expect, it } from "vitest";
import type { GlobalSettings } from "../../types";
import {
  INITIAL_CATEGORY,
  VALIDATION_ERROR_CATEGORY,
  dirtyCategories,
  groupCategories,
  visibleCategories,
  type SettingsCategoryEnv,
} from "./settingsCategories";
import { createSettingsDraft } from "./settingsDraft";

const baseGlobalSettings: GlobalSettings = {
  theme: "dark",
  customCSS: "",
  windowBounds: { x: 0, y: 0, width: 1400, height: 900 },
  defaultAutoReloadEnabled: true,
  defaultAutoReloadInterval: 600,
  defaultShowCountdown: true,
  defaultHideHeaderEnabled: true,
  defaultHideTweetInputEnabled: true,
  defaultShowCustomMenu: false,
  defaultScrollPosRestoreEnabled: false,
  defaultColumnCustomCSS: "",
  popupEscCloseEnabled: true,
  videoAutoPlayStopEnabled: true,
  imagePopupEnabled: true,
  videoPopupEnabled: true,
  smallImageEnabled: false,
  smallImageWidth: "50%",
  blurImageEnabled: false,
  blurImageAmount: "10px",
  hideAdEnabled: true,
  hideGrokButtonEnabled: false,
  apiRateLimitMonitorEnabled: true,
  columnScale: "default",
  uiScale: "auto",
  language: "auto",
  useXAppForCompose: false,
  mobileSwipeAreaEnabled: true,
  mobileSwipeAreaHeight: 28,
  mobileSwipeAreaOpacity: 50,
  mobileTwoColumnEnabled: true,
  mobileColumnCount: 2,
  presets: [],
  ngWords: [],
  repostHiddenUserIds: [],
  pendingDataDirectoryDeletions: [],
  hardwareVideoDecodeEnabled: true,
  h264DownloadPromptDismissed: false,
};

const grouped = (env: SettingsCategoryEnv) =>
  groupCategories(visibleCategories(env)).map((g) => ({
    group: g.group,
    ids: g.categories.map((c) => c.id),
  }));

const modeOf = (env: SettingsCategoryEnv, id: string) =>
  visibleCategories(env).find((c) => c.id === id)?.mode;

const desktopWindows: SettingsCategoryEnv = {
  isMobile: false,
  extensionsSupported: true,
};

describe("カテゴリの構成と表示条件", () => {
  it("デスクトップのアプリ設定ではサイドナビにカテゴリが分類ごとに並ぶ", () => {
    expect(grouped(desktopWindows)).toEqual([
      {
        group: "general",
        ids: ["display", "filter", "media", "columnDefaults"],
      },
      { group: "columns", ids: ["layout", "presets"] },
      { group: "dataExtensions", ids: ["extensions", "backup"] },
      { group: "app", ids: ["maintenance", "about"] },
    ]);
  });

  it("モバイルのアプリ設定ではAndroid専用が表示されプリセットと拡張機能が表示されない", () => {
    const groups = grouped({ isMobile: true, extensionsSupported: false });
    const general = groups.find((g) => g.group === "general");
    const allIds = groups.flatMap((g) => g.ids);
    expect(general?.ids).toContain("android");
    expect(allIds).not.toContain("presets");
    expect(allIds).not.toContain("extensions");
  });

  it("Windows以外のデスクトップでは拡張機能カテゴリが表示されない", () => {
    const groups = grouped({ isMobile: false, extensionsSupported: false });
    const dataExtensions = groups.find((g) => g.group === "dataExtensions");
    expect(groups.flatMap((g) => g.ids)).not.toContain("extensions");
    expect(dataExtensions?.ids).toContain("backup");
  });

  it("開いたときは表示カテゴリから始まり、入力エラーは閲覧・フィルタカテゴリに属する", () => {
    expect(INITIAL_CATEGORY).toBe("display");
    expect(VALIDATION_ERROR_CATEGORY).toBe("filter");
  });
});

describe("フッターの適用方法", () => {
  it.each(["display", "filter", "media", "columnDefaults"])(
    "下書き対象のカテゴリ（%s）ではフッターにキャンセルと適用が表示される",
    (id) => {
      expect(modeOf(desktopWindows, id)).toBe("draft");
    },
  );

  it.each(["layout", "backup", "maintenance", "about"])(
    "下書き対象外のカテゴリ（%s）ではフッターに閉じるだけが表示される",
    (id) => {
      expect(modeOf(desktopWindows, id)).not.toBe("draft");
    },
  );
});

describe("未適用の変更の判定", () => {
  const initial = createSettingsDraft(baseGlobalSettings);

  it("未適用の変更があるカテゴリにはサイドナビに印が付く", () => {
    const changed = { ...initial, theme: "light" as const };
    const dirty = dirtyCategories(initial, changed);
    expect(dirty.has("display")).toBe(true);
    expect(dirty.has("media")).toBe(false);
  });

  it("値を元に戻すと未適用の印が消える", () => {
    const changed = { ...initial, theme: "light" as const };
    const reverted = { ...changed, theme: initial.theme };
    expect(dirtyCategories(initial, changed).has("display")).toBe(true);
    expect(dirtyCategories(initial, reverted).has("display")).toBe(false);
  });

  it("複数カテゴリで編集した値は1回の適用でまとめて保存される", () => {
    const changed = {
      ...initial,
      theme: "light" as const,
      hideAdEnabled: !initial.hideAdEnabled,
    };
    const dirty = dirtyCategories(initial, changed);
    expect(dirty.has("display")).toBe(true);
    expect(dirty.has("filter")).toBe(true);
    expect(dirty.size).toBe(2);
  });

  it("変更が無ければどのカテゴリにも印が付かない", () => {
    expect(dirtyCategories(initial, { ...initial }).size).toBe(0);
  });
});
