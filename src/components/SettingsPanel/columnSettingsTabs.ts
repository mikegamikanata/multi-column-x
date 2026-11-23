import type { Column } from "@/types";

export type ColumnSettingsTabId = "basic" | "view" | "filter" | "css";

export const COLUMN_SETTINGS_TABS: readonly ColumnSettingsTabId[] = [
  "basic",
  "view",
  "filter",
  "css",
];

/** カラム設定を開いたときに選ばれているタブ（前回の位置は記憶しない） */
export const INITIAL_COLUMN_SETTINGS_TAB: ColumnSettingsTabId = "basic";

/** 行リスト入力（NGワード・リポスト非表示・ホワイトリスト）の検証エラーが属するタブ */
export const LINE_LIST_ERROR_TAB: ColumnSettingsTabId = "filter";

/** 表示するタブ。外部サイトカラムは項目が少ないためタブを出さない（null） */
export function columnSettingsTabs(
  column: Pick<Column, "pageType">,
): readonly ColumnSettingsTabId[] | null {
  return column.pageType === "external" ? null : COLUMN_SETTINGS_TABS;
}
