import { useEffect, useRef } from "react";
import { registerBackHandler } from "@/lib/androidBackHandler";

/**
 * enabled の間だけ端末の戻る操作のハンドラを登録する。
 * handler は ref 経由で最新を参照し、再レンダーでは再登録しない（登録順を保つため）。
 */
export function useAndroidBackHandler(
  enabled: boolean,
  handler: () => boolean,
): void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!enabled) return;
    return registerBackHandler(() => handlerRef.current());
  }, [enabled]);
}
