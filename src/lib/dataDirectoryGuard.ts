import type { Account, Column } from "@/types";

/** パス末尾要素（区切りは / と \ の両方を許容） */
const lastSegment = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? "";

/**
 * 現在使用中（登録中のアカウント、または存在する外部カラム）のデータフォルダか。
 * 使用中のフォルダは削除予定の再実行でも削除してはならない。
 */
export function isActiveDataDirectory(
  dir: string,
  accounts: Account[],
  columns: Column[],
): boolean {
  if (accounts.some((a) => a.dataDirectory === dir)) return true;
  const name = lastSegment(dir);
  return columns.some(
    (c) => c.pageType === "external" && name === `column-${c.id}`,
  );
}
