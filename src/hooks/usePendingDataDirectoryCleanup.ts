import { useEffect, useRef } from "react";
import { logError } from "@/lib/log";
import { useAppStore } from "@/store/useAppStore";

/** 起動時（カラム復元完了後）に1回だけ、削除予定のデータフォルダを再実行する。 */
export function usePendingDataDirectoryCleanup(
  ready: boolean,
  retry: () => Promise<{ remaining: number }>,
): void {
  const ranRef = useRef(false);
  useEffect(() => {
    if (!ready || ranRef.current) return;
    // 復元中は実行しない（復元完了後の再評価に任せる）
    if (useAppStore.getState().restoreInProgress) return;
    ranRef.current = true;
    if (
      useAppStore.getState().globalSettings.pendingDataDirectoryDeletions
        .length === 0
    ) {
      return;
    }
    retry().catch(logError("pendingDataDirectoryCleanup"));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 起動時1回のみ。retry の参照変化で再実行させない
  }, [ready]);
}
