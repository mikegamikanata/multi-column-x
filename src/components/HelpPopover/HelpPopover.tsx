import React, { useCallback, useId, useRef, useState } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import styles from "./HelpPopover.module.scss";

interface HelpPopoverProps {
  /** トリガーボタンの aria-label / title、ポップオーバーの aria-label に使う */
  label: string;
  children: React.ReactNode;
}

export const HelpPopover: React.FC<HelpPopoverProps> = ({
  label,
  children,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverId = useId();

  const close = () => setIsOpen(false);

  // Escape で閉じたときは、開いたトリガーへフォーカスを戻す（外側クリックではフォーカスを奪わない）
  const closeByEscape = useCallback(() => {
    if (!isOpen) return;
    setIsOpen(false);
    triggerRef.current?.focus();
  }, [isOpen]);

  useOutsideClick(containerRef, close, isOpen);

  return (
    // Esc は document ではなくここで受ける。ModalDialog 内では Esc が document まで伝わらないうえ、
    // preventDefault により「ポップオーバーだけ閉じてダイアログは閉じない」を ModalDialog に伝えるため。
    // キーボード操作はトリガー / ポップオーバー内の子要素が担うので、コンテナ自体は操作対象ではない。
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- 子要素で起きた Esc を受ける委譲ハンドラで、コンテナ自体は操作対象ではない
    <div
      className={styles.container}
      ref={containerRef}
      onKeyDown={(e) => {
        if (isOpen && e.key === "Escape") {
          e.preventDefault();
          closeByEscape();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={label}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-controls={isOpen ? popoverId : undefined}
        title={label}
      >
        ?
      </button>
      {isOpen && (
        <div
          id={popoverId}
          className={styles.popover}
          role="dialog"
          aria-label={label}
        >
          {children}
        </div>
      )}
    </div>
  );
};
