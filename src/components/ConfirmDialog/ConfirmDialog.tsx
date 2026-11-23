import React, { useId } from "react";
import { useTranslation } from "react-i18next";
import { ModalDialog } from "@/components/ModalDialog/ModalDialog";
import styles from "./ConfirmDialog.module.scss";

interface ConfirmDialogProps {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  singleButton?: boolean;
  /** データの削除など取り消せない操作の確認では "danger" を指定する */
  variant?: "default" | "danger";
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  singleButton = false,
  variant = "default",
}) => {
  const { t } = useTranslation();
  const titleId = useId();
  const messageId = useId();
  // 取り消せない操作の確認では、誤って確定しないようキャンセル側を初期フォーカスにする
  const focusCancel = variant === "danger" && !singleButton;

  return (
    <ModalDialog
      className={styles.overlay}
      aria-labelledby={title ? titleId : messageId}
      aria-describedby={title ? messageId : undefined}
      onEscape={onCancel}
    >
      <div className={styles.dialog}>
        {title && (
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
        )}
        <p id={messageId} className={styles.message}>
          {message}
        </p>

        <div className={styles.actions}>
          {!singleButton && (
            <button
              type="button"
              className={styles.cancelBtn}
              data-autofocus={focusCancel ? "" : undefined}
              onClick={onCancel}
            >
              {cancelLabel ?? t("dialogs:confirm.cancel")}
            </button>
          )}
          <button
            type="button"
            className={
              variant === "danger" ? styles.dangerBtn : styles.confirmBtn
            }
            data-autofocus={focusCancel ? undefined : ""}
            onClick={onConfirm}
          >
            {confirmLabel ?? t("dialogs:confirm.ok")}
          </button>
        </div>
      </div>
    </ModalDialog>
  );
};
