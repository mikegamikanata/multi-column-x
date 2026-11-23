import type { SettingsDraft } from "./settingsDraft";

export type DraftCategoryId =
  "display" | "filter" | "media" | "columnDefaults" | "android";
export type SettingsCategoryId =
  | DraftCategoryId
  | "layout"
  | "presets"
  | "extensions"
  | "backup"
  | "maintenance"
  | "about";
export type SettingsNavGroupId =
  "general" | "columns" | "dataExtensions" | "app";
/** draft=共有下書き＋フッターの適用 / own=ページ内で適用（カラム配置）/ instant=即時反映 */
export type CategoryApplyMode = "draft" | "own" | "instant";

export interface SettingsCategoryDef {
  id: SettingsCategoryId;
  group: SettingsNavGroupId;
  mode: CategoryApplyMode;
}

export const SETTINGS_CATEGORIES: readonly SettingsCategoryDef[] = [
  { id: "display", group: "general", mode: "draft" },
  { id: "filter", group: "general", mode: "draft" },
  { id: "media", group: "general", mode: "draft" },
  { id: "columnDefaults", group: "general", mode: "draft" },
  { id: "android", group: "general", mode: "draft" },
  { id: "layout", group: "columns", mode: "own" },
  { id: "presets", group: "columns", mode: "instant" },
  { id: "extensions", group: "dataExtensions", mode: "instant" },
  { id: "backup", group: "dataExtensions", mode: "instant" },
  { id: "maintenance", group: "app", mode: "instant" },
  { id: "about", group: "app", mode: "instant" },
];

export const INITIAL_CATEGORY: SettingsCategoryId = "display";
/** 入力検証エラー（NGワード・リポスト非表示ユーザー）が属するカテゴリ */
export const VALIDATION_ERROR_CATEGORY: SettingsCategoryId = "filter";

export interface SettingsCategoryEnv {
  isMobile: boolean;
  extensionsSupported: boolean;
}

export function visibleCategories(
  env: SettingsCategoryEnv,
): SettingsCategoryDef[] {
  return SETTINGS_CATEGORIES.filter((c) => {
    if (c.id === "android") return env.isMobile;
    if (c.id === "presets") return !env.isMobile;
    if (c.id === "extensions") return env.extensionsSupported;
    return true;
  });
}

export interface SettingsNavGroup {
  group: SettingsNavGroupId;
  categories: SettingsCategoryDef[];
}

/** 定義順を保ったまま分類ごとにまとめる（空の分類は含めない） */
export function groupCategories(
  categories: readonly SettingsCategoryDef[],
): SettingsNavGroup[] {
  const groups: SettingsNavGroup[] = [];
  for (const category of categories) {
    const existing = groups.find((g) => g.group === category.group);
    if (existing) {
      existing.categories.push(category);
    } else {
      groups.push({ group: category.group, categories: [category] });
    }
  }
  return groups;
}

/** 下書きの各キーがどのカテゴリに属するか（キー追加時は型エラーで割当を強制） */
export const DRAFT_KEY_CATEGORY: Record<keyof SettingsDraft, DraftCategoryId> =
  {
    theme: "display",
    columnScale: "display",
    uiScale: "display",
    language: "display",
    columnScaleOverrideEnabled: "display",
    uiScaleOverrideEnabled: "display",
    themeOverrideEnabled: "display",
    apiRateLimitMonitorEnabled: "display",
    globalNgWordsText: "filter",
    globalRepostHiddenUserIdsText: "filter",
    hideAdEnabled: "filter",
    popupEscCloseEnabled: "media",
    videoAutoPlayStopEnabled: "media",
    hardwareVideoDecodeEnabled: "media",
    imagePopupEnabled: "media",
    videoPopupEnabled: "media",
    defaultAutoReloadEnabled: "columnDefaults",
    defaultAutoReloadInterval: "columnDefaults",
    defaultShowCountdown: "columnDefaults",
    defaultHideHeaderEnabled: "columnDefaults",
    defaultHideTweetInputEnabled: "columnDefaults",
    defaultShowCustomMenu: "columnDefaults",
    defaultScrollPosRestoreEnabled: "columnDefaults",
    defaultColumnCustomCSS: "columnDefaults",
    smallImageEnabled: "columnDefaults",
    smallImageWidth: "columnDefaults",
    blurImageEnabled: "columnDefaults",
    blurImageAmount: "columnDefaults",
    useXAppForCompose: "android",
    mobileSwipeAreaEnabled: "android",
    mobileSwipeAreaHeight: "android",
    mobileSwipeAreaOpacity: "android",
    mobileTwoColumnEnabled: "android",
    mobileColumnCount: "android",
  };

/** 初期下書きと異なる値を持つカテゴリの集合（値を元に戻せば含まれなくなる） */
export function dirtyCategories(
  initial: SettingsDraft,
  draft: SettingsDraft,
): ReadonlySet<DraftCategoryId> {
  const result = new Set<DraftCategoryId>();
  (Object.keys(DRAFT_KEY_CATEGORY) as (keyof SettingsDraft)[]).forEach(
    (key) => {
      if (!Object.is(initial[key], draft[key])) {
        result.add(DRAFT_KEY_CATEGORY[key]);
      }
    },
  );
  return result;
}
