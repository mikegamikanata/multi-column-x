import React, { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalDialog } from "@/components/ModalDialog/ModalDialog";
import styles from "./AccountNameDialog.module.scss";

interface AccountNameDialogProps {
  defaultValue: string;
  title: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

export const AccountNameDialog: React.FC<AccountNameDialogProps> = ({
  defaultValue,
  title,
  onSubmit,
  onCancel,
}) => {
  const { t } = useTranslation();
  const titleId = useId();
  const inputId = useId();

  const [name, setName] = useState(defaultValue);
  const trimmed = name.trim();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <ModalDialog
      className={styles.overlay}
      aria-labelledby={titleId}
      onEscape={onCancel}
    >
      <form className={styles.dialog} onSubmit={handleSubmit}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>

        <div className={styles.field}>
          <label className={styles.label} htmlFor={inputId}>
            {t("accounts:nameDialog.nameLabel")}
          </label>
          <input
            id={inputId}
            className={styles.input}
            data-autofocus=""
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>
            {t("accounts:nameDialog.cancel")}
          </button>
          <button
            type="submit"
            className={styles.submitBtn}
            disabled={!trimmed}
          >
            {t("accounts:nameDialog.ok")}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
};
