// src/lib/serializeLatest.ts
// 非同期処理を「同時実行 1 件まで・実行中に来た要求はまとめて完了後に 1 回だけ実行」に直列化する。
// 横スクロール等でカラム再配置（resize_column_webview）が前の呼び出しの完了前に重なると、
// Linux で古い位置指定が新しい位置指定を追い越して最後に残ることがあるため、その防止に使う。

export interface SerializedLatest {
  /**
   * 実行を要求する。返り値の Promise は「この呼び出し以降に開始した実行」の完了で決着する。
   * - 待機中なら即座に実行を開始する。
   * - 実行中なら、現在の実行の完了後に 1 回だけ実行する（実行中の複数要求は 1 回にまとめる）。
   */
  (): Promise<void>;
  /** 保留中（未開始）の実行を取り消す。保留中の呼び出し元の Promise は resolve する。実行中の処理は止めない。 */
  cancel: () => void;
}

export function serializeLatest(fn: () => Promise<void>): SerializedLatest {
  let running = false;
  let pending: {
    promise: Promise<void>;
    resolve: () => void;
    reject: (e: unknown) => void;
  } | null = null;

  const start = (): Promise<void> => {
    running = true;
    let p: Promise<void>;
    try {
      p = fn();
    } catch (e) {
      p = Promise.reject(e);
    }
    return p.finally(() => {
      running = false;
      const next = pending;
      pending = null;
      if (next) start().then(next.resolve, next.reject);
    });
  };

  const call = (() => {
    if (!running) return start();
    if (!pending) {
      let resolve!: () => void;
      let reject!: (e: unknown) => void;
      const promise = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      pending = { promise, resolve, reject };
    }
    return pending.promise;
  }) as SerializedLatest;
  call.cancel = () => {
    const p = pending;
    pending = null;
    p?.resolve();
  };
  return call;
}
