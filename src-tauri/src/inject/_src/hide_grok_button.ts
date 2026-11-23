(function () {
  const config = window.__multiColumnXConfig;
  if (!config?.hideGrokButtonEnabled) return;

  const STYLE_ID = "multi-column-x-hide-grok-button";
  // ポスト内（article 配下）で、aria-label に grok を含み、Grok のロゴ SVG（path の d が M12.745 20.54 で始まる）
  // を持つボタンだけを隠す。言語に依存しない。ポスト外（Grok ドロワー・画像生成）は article の外なので対象外。
  const HIDE_GROK_BUTTON_CSS =
    'article button[aria-label*="grok" i]:has(svg path[d^="M12.745 20.54"]) { display: none !important; }';

  function createStyleElement(): void {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = HIDE_GROK_BUTTON_CSS;
    document.head.appendChild(style);
  }

  // document-start では head が未生成のことがある（custom_css.ts と同じ待ち方）
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

  function restoreIfMissing(): void {
    if (!document.head) return;
    if (document.getElementById(STYLE_ID)) return;
    createStyleElement();
  }

  let restoreTimer: ReturnType<typeof setTimeout> | undefined;

  // X の SPA が head の style 要素を消すことがあるため、消えたら作り直す（custom_css.ts と同じ自己修復）
  function observeHeadChildren(): void {
    new MutationObserver(() => {
      clearTimeout(restoreTimer);
      restoreTimer = setTimeout(restoreIfMissing, 100);
    }).observe(document.head, { childList: true });
  }

  whenHeadReady(() => {
    restoreIfMissing();
    observeHeadChildren();
  });
})();
