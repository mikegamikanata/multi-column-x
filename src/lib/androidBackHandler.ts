type BackHandler = () => boolean;

const handlers: BackHandler[] = [];

/** 端末の戻る操作のハンドラを登録する（後から登録したものを優先）。戻り値で登録解除 */
export function registerBackHandler(handler: BackHandler): () => void {
  handlers.push(handler);
  return () => {
    const index = handlers.lastIndexOf(handler);
    if (index >= 0) handlers.splice(index, 1);
  };
}

/** 戻る操作を画面側で処理したら true。ネイティブ側から呼ばれる */
export function handleAndroidBack(): boolean {
  for (let i = handlers.length - 1; i >= 0; i--) {
    if (handlers[i]()) return true;
  }
  return false;
}

declare global {
  interface Window {
    __mcxHandleBack?: () => boolean;
  }
}

/** ネイティブ（MainActivity）が evaluateJavascript で呼ぶ入口を公開する。モバイル起動時に呼ぶ */
export function installAndroidBackBridge(): void {
  window.__mcxHandleBack = handleAndroidBack;
}
