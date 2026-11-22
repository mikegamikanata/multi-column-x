// src/services/externalColumn.ts
// account に紐付かない external カラム（アカウント非依存の任意URLカラム）向けの
// データディレクトリ解決ロジックを集約するサービス層
import { invoke } from "@tauri-apps/api/core";
import { IPC_COMMANDS } from "../constants/ipc";
import type { Account, Column } from "../types";

/** カラムが external（アカウント非依存の任意URLカラム）かどうかを判定する */
export function isExternalColumn(column: Column): boolean {
  return column.pageType === "external";
}

/**
 * カラムに対応する WebView データディレクトリを解決する。
 * external カラムはアカウント非依存のため、カラムIDから導出した専用ディレクトリを
 * Rust側コマンドで都度取得する。それ以外のカラムは、紐付くアカウントの
 * dataDirectory をそのまま返す（該当アカウントが見つからない場合は undefined を返し、
 * 呼び出し側は従来どおりそのカラムの処理をスキップする）。
 */
export async function resolveColumnDataDirectory(
  column: Column,
  accounts: Account[],
): Promise<string | undefined> {
  if (isExternalColumn(column)) {
    return invoke<string>(IPC_COMMANDS.GET_EXTERNAL_COLUMN_DATA_DIRECTORY, {
      columnId: column.id,
    });
  }
  return accounts.find((a) => a.id === column.accountId)?.dataDirectory;
}

/**
 * external カラム専用のデータディレクトリを削除する。
 * column_id から Rust 側でパスを組み立てるため、呼び出し側は任意パスを渡さない。
 * 再試行しても消せなかった場合は、削除予定に登録すべきパスを返す（削除完了なら null）。
 */
export async function deleteExternalColumnData(
  columnId: string,
): Promise<string | null> {
  return invoke<string | null>(IPC_COMMANDS.DELETE_EXTERNAL_COLUMN_DATA, {
    columnId,
  });
}
