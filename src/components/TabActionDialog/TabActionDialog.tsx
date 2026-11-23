import React, { useId } from "react";
import { useTranslation } from "react-i18next";
import { ModalDialog } from "@/components/ModalDialog/ModalDialog";
import CloseIcon from "../../assets/icons/close.svg?react";
import SettingsIcon from "../../assets/icons/settings.svg?react";
import styles from "./TabActionDialog.module.scss";

interface Props {
  columnLabel: string;
  onReload: () => void;
  onSettings: () => void;
  onRemove: () => void;
  onClose: () => void;
}

export const TabActionDialog: React.FC<Props> = ({
  columnLabel,
  onReload,
  onSettings,
  onRemove,
  onClose,
}) => {
  const { t } = useTranslation();
  const labelId = useId();

  return (
    <ModalDialog
      className={styles.overlay}
      aria-labelledby={labelId}
      onEscape={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.sheet}>
        <p id={labelId} className={styles.label}>
          {columnLabel}
        </p>
        <button className={styles.actionBtn} data-autofocus onClick={onReload}>
          <span aria-hidden="true">⟳</span>
          {t("dialogs:tabAction.reload")}
        </button>
        <button className={styles.actionBtn} onClick={onSettings}>
          <SettingsIcon
            width={16}
            height={16}
            aria-hidden="true"
            data-testid="icon-settings"
          />
          {t("dialogs:tabAction.settings")}
        </button>
        <button
          className={`${styles.actionBtn} ${styles.dangerBtn}`}
          onClick={onRemove}
        >
          <CloseIcon
            width={16}
            height={16}
            aria-hidden="true"
            data-testid="icon-close"
          />
          {t("dialogs:tabAction.remove")}
        </button>
        <button className={styles.cancelBtn} onClick={onClose}>
          {t("dialogs:tabAction.cancel")}
        </button>
      </div>
    </ModalDialog>
  );
};
