import React, { useImperativeHandle, useLayoutEffect, useRef } from "react";
import { useRestoreFocus } from "@/hooks/useRestoreFocus";

const TABBABLE_SELECTOR =
  "a[href], button, input:not([type=hidden]), select, textarea, summary, [tabindex], [contenteditable]";

/** 画面に表示されているか。checkVisibility が無い環境（古い WebKit・jsdom）では祖先の display も辿って判定する。 */
function isVisible(el: HTMLElement): boolean {
  if (el.closest("[hidden], [inert]")) return false;
  if (typeof el.checkVisibility === "function") {
    return el.checkVisibility({ visibilityProperty: true });
  }
  if (getComputedStyle(el).visibility === "hidden") return false;
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    if (getComputedStyle(node).display === "none") return false;
  }
  return true;
}

/** ダイアログ自身に属するタブ到達可能な要素を文書順で返す。 */
function getTabbables(dialog: HTMLDialogElement): HTMLElement[] {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR),
  ).filter(
    (el) =>
      !el.matches(":disabled") &&
      el.tabIndex >= 0 &&
      el.closest("dialog") === dialog && // 入れ子の別ダイアログ内の要素は除く
      isVisible(el),
  );
}

/**
 * Tab / Shift+Tab がダイアログの外へ出ないよう端で折り返す。中間の要素はブラウザの既定に任せる。
 */
function wrapTab(
  e: React.KeyboardEvent<HTMLDialogElement>,
  dialog: HTMLDialogElement,
): void {
  const items = getTabbables(dialog);
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  // 入れ子の別ダイアログ内にフォーカスがあるときは、そのダイアログ自身の処理に任せる
  if (
    active &&
    dialog.contains(active) &&
    active.closest("dialog") !== dialog
  ) {
    return;
  }
  if (!first || !last) {
    e.preventDefault();
    dialog.focus(); // 操作要素が無いときはダイアログ自身に留める
    return;
  }
  if (!active) return;
  const outside = !dialog.contains(active);
  if (e.shiftKey) {
    const atOrBeforeFirst =
      outside ||
      active === first ||
      Boolean(
        first.compareDocumentPosition(active) &
        Node.DOCUMENT_POSITION_PRECEDING,
      );
    if (atOrBeforeFirst) {
      e.preventDefault();
      last.focus();
    }
  } else {
    const atOrAfterLast =
      outside ||
      active === dialog ||
      active === last ||
      Boolean(
        last.compareDocumentPosition(active) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
    if (atOrAfterLast) {
      e.preventDefault();
      first.focus();
    }
  }
}

interface ModalDialogProps extends Omit<
  React.DialogHTMLAttributes<HTMLDialogElement>,
  "open" | "onCancel" | "onClose"
> {
  /** Esc で呼ばれる。 */
  onEscape?: () => void;
  ref?: React.Ref<HTMLDialogElement>;
}

export const ModalDialog: React.FC<ModalDialogProps> = ({
  onEscape,
  onKeyDown,
  children,
  ref,
  ...rest
}) => {
  const innerRef = useRef<HTMLDialogElement>(null);
  useImperativeHandle(ref, () => innerRef.current as HTMLDialogElement);
  useRestoreFocus(); // 初回レンダー中に元の要素を覚える（子の focus より前）

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el || el.open) return; // StrictMode の二重実行では何もしない
    el.showModal();
    const target = el.querySelector<HTMLElement>(
      "[data-autofocus]:not(:disabled)",
    );
    if (target) {
      target.focus();
    } else if (
      document.activeElement === document.body ||
      document.activeElement === null
    ) {
      el.focus(); // 操作要素が無い・全部 disabled のとき
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDialogElement>) => {
    onKeyDown?.(e);
    if (e.key === "Tab" && !e.defaultPrevented) {
      wrapTab(e, e.currentTarget);
      return;
    }
    if (e.key === "Escape" && !e.defaultPrevented) {
      e.preventDefault();
      e.stopPropagation();
      onEscape?.();
    }
  };

  return (
    <dialog
      {...rest}
      ref={innerRef}
      aria-modal="true"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      onCancel={(e) => {
        e.preventDefault();
        onEscape?.();
      }}
      onClose={() => {
        // ネイティブに閉じられても React が mount したままなら開き直す（状態と表示を一致させる）
        const el = innerRef.current;
        if (el && el.isConnected && !el.open) el.showModal();
      }}
    >
      {children}
    </dialog>
  );
};
