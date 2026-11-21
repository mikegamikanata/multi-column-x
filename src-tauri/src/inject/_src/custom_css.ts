// src-tauri/src/inject/_src/custom_css.ts
(function () {
  const CUSTOM_CSS_ID = "multi-column-x-custom-css";

  // 最後に適用が要求されたCSS。X.com側のSPA内DOM再構築でstyle要素が
  // 消えた際、MutationObserverによる自己修復（restoreIfMissing）で
  // 参照する状態として保持する。head生成前の要求も、準備完了後にこの値で反映する。
  let lastAppliedCSS = "";

  function isBlank(css: string): boolean {
    return !css || css.trim() === "";
  }

  function createStyleElement(css: string): void {
    const style = document.createElement("style");
    style.id = CUSTOM_CSS_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // document-start では head が未生成のことがある。head 生成を直接監視して待つ
  // （window.__mcxDomObserver は body を監視するため head 生成前には使えない）。
  // 待つのは head 生成前の小さな DOM だけで、見つかり次第 disconnect する。
  function whenHeadReady(callback: () => void): void {
    if (document.head) {
      callback();
      return;
    }
    const observer = new MutationObserver(() => {
      if (!document.head) return;
      observer.disconnect();
      callback();
    });
    observer.observe(document, { childList: true, subtree: true });
  }

  function renderLastAppliedCSS(): void {
    document.getElementById(CUSTOM_CSS_ID)?.remove();
    if (isBlank(lastAppliedCSS)) return;
    createStyleElement(lastAppliedCSS);
  }

  let renderPending = false;

  // head 準備後の反映は1回だけ予約する。複数回要求されても、
  // 反映時点の lastAppliedCSS（＝最後の要求）だけが効く。
  function renderWhenHeadReady(): void {
    if (renderPending) return;
    renderPending = true;
    whenHeadReady(() => {
      renderPending = false;
      renderLastAppliedCSS();
    });
  }

  function applyCustomCSS(css: string): void {
    lastAppliedCSS = css;
    if (document.head) {
      renderLastAppliedCSS();
      return;
    }
    renderWhenHeadReady();
  }

  // headからstyle要素が消えている場合のみ、最後に適用されたCSSで再作成する。
  // 適用中のCSSが無い、またはheadが無ければ何もしない（余計な副作用を起こさない）。
  function restoreIfMissing(): void {
    if (!document.head) return;
    if (isBlank(lastAppliedCSS)) return;
    if (document.getElementById(CUSTOM_CSS_ID)) return;
    createStyleElement(lastAppliedCSS);
  }

  let restoreTimer: ReturnType<typeof setTimeout> | undefined;

  function scheduleRestore(): void {
    clearTimeout(restoreTimer);
    restoreTimer = setTimeout(restoreIfMissing, 100);
  }

  function observeHeadChildren(): void {
    new MutationObserver(scheduleRestore).observe(document.head, {
      childList: true,
    });
  }

  whenHeadReady(observeHeadChildren);

  window.__multiColumnX =
    window.__multiColumnX || ({} as Window["__multiColumnX"]);
  window.__multiColumnX.applyCustomCSS = applyCustomCSS;
})();
