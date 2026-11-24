import React, { useState, useId } from "react";
import { useTranslation } from "react-i18next";
import { ModalDialog } from "@/components/ModalDialog/ModalDialog";
import type { Account } from "../../types";
import styles from "./LinkPopupDialog.module.scss";

interface LinkPopupDialogProps {
  accounts: Account[];
  defaultAccountId: string;
  onSubmit: (url: string, accountId: string) => void;
  onClose: () => void;
  /** 指定時はURL入力欄を隠し、常にこのURLで送信する（公式設定を開く用途など） */
  fixedUrl?: string;
  /** ダイアログタイトル（省略時は既存の "URLをポップアップウィンドウで開く"） */
  title?: string;
}

export const LinkPopupDialog: React.FC<LinkPopupDialogProps> = ({
  accounts,
  defaultAccountId,
  onSubmit,
  onClose,
  fixedUrl,
  title,
}) => {
  const { t } = useTranslation();
  const [url, setUrl] = useState(fixedUrl ?? "");
  const [accountId, setAccountId] = useState(defaultAccountId);
  const titleId = useId();

  const handleSubmit = () => {
    onSubmit(fixedUrl ?? url, accountId);
    setUrl("");
  };

  const handleCancel = () => {
    setUrl("");
    onClose();
  };

  return (
    <ModalDialog
      className={styles.overlay}
      aria-labelledby={titleId}
      onEscape={handleCancel}
    >
      <div className={styles.panel}>
        <h3 id={titleId}>{title ?? t("dialogs:linkPopup.defaultTitle")}</h3>
        {!fixedUrl && (
          <input
            data-autofocus=""
            className={styles.input}
            type="text"
            aria-label={t("dialogs:linkPopup.urlLabel")}
            placeholder={t("dialogs:linkPopup.urlPlaceholder")}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
          />
        )}
        {accounts.length > 1 && (
          <select
            className={styles.select}
            aria-label={t("dialogs:linkPopup.accountLabel")}
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={handleCancel}
          >
            {t("dialogs:linkPopup.cancel")}
          </button>
          <button type="button" className={styles.okBtn} onClick={handleSubmit}>
            {t("dialogs:linkPopup.open")}
          </button>
        </div>
      </div>
    </ModalDialog>
  );
};
