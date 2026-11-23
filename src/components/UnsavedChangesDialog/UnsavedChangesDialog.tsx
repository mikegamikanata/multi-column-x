import React from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../ConfirmDialog/ConfirmDialog";

interface UnsavedChangesDialogProps {
  /** 変更を破棄して閉じる */
  onDiscard: () => void;
  /** 確認だけ閉じて編集に戻る */
  onBack: () => void;
}

/** 設定画面を未適用の変更ありで閉じようとしたときの確認メッセージ */
export const UnsavedChangesDialog: React.FC<UnsavedChangesDialogProps> = ({
  onDiscard,
  onBack,
}) => {
  const { t } = useTranslation();
  return (
    <ConfirmDialog
      title={t("dialogs:unsavedChanges.title")}
      message={t("dialogs:unsavedChanges.message")}
      confirmLabel={t("dialogs:unsavedChanges.discard")}
      cancelLabel={t("dialogs:unsavedChanges.back")}
      variant="danger"
      onConfirm={onDiscard}
      onCancel={onBack}
    />
  );
};
