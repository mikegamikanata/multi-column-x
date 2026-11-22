import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { StatusMark } from "@/components/StatusMark/StatusMark";
import styles from "./AppSettingsPanel.module.scss";

interface AppInfoSectionsProps {
  onOpenOfficialSettings: () => void;
  onReloadAllWebviews: () => void;
  appVersion: string;
  updateChecking: boolean;
  updateManualResult: "idle" | "none" | "error";
  onCheckUpdate: () => void;
  pendingDataDirectoryDeletionCount: number;
  retryingDataDirectoryDeletion: boolean;
  dataDirectoryDeletionRetryResult: "idle" | "success" | "remaining";
  dataDirectoryDeletionRemainingCount: number;
  onRetryDataDirectoryDeletion: () => void;
}

/** 「公式設定」「WebView」「アプリ情報」「データフォルダの削除」セクション（ドラフト非依存） */
export const AppInfoSections: React.FC<AppInfoSectionsProps> = ({
  onOpenOfficialSettings,
  onReloadAllWebviews,
  appVersion,
  updateChecking,
  updateManualResult,
  onCheckUpdate,
  pendingDataDirectoryDeletionCount,
  retryingDataDirectoryDeletion,
  dataDirectoryDeletionRetryResult,
  dataDirectoryDeletionRemainingCount,
  onRetryDataDirectoryDeletion,
}) => {
  const { t } = useTranslation();
  const resultRef = useRef<HTMLParagraphElement>(null);
  // 結果が変わったときだけ見える位置へ寄せる（依存を増やすと再描画のたびに引き戻される）
  useEffect(() => {
    if (updateManualResult === "idle") return;
    resultRef.current?.scrollIntoView({ block: "nearest" });
  }, [updateManualResult]);
  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          {t("settings:info.officialSettings.title")}
        </h3>
        <p className={styles.hint}>
          {t("settings:info.officialSettings.hint")}
        </p>
        <button
          type="button"
          className={styles.applyAllBtn}
          onClick={onOpenOfficialSettings}
        >
          {t("settings:info.officialSettings.open")}
        </button>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          {t("settings:info.webview.title")}
        </h3>
        <p className={styles.hint}>{t("settings:info.webview.hint")}</p>
        <button
          type="button"
          className={styles.applyAllBtn}
          onClick={onReloadAllWebviews}
        >
          {t("settings:info.webview.reload")}
        </button>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t("settings:info.app.title")}</h3>
        <p className={styles.hint}>
          {t("settings:info.app.version", { version: appVersion })}
        </p>
        <button
          type="button"
          className={styles.applyAllBtn}
          onClick={onCheckUpdate}
          disabled={updateChecking}
        >
          {updateChecking
            ? t("settings:info.app.checking")
            : t("settings:info.app.check")}
        </button>
        {updateManualResult === "none" && (
          <p
            ref={resultRef}
            role="status"
            className={`${styles.hint} ${styles.updateResult}`}
          >
            <StatusMark kind="success" />
            {t("settings:info.app.upToDate")}
          </p>
        )}
        {updateManualResult === "error" && (
          <p
            ref={resultRef}
            role="status"
            className={`${styles.hint} ${styles.updateResult}`}
          >
            <StatusMark kind="warning" />
            {t("settings:info.app.checkFailed")}
          </p>
        )}
      </section>

      {pendingDataDirectoryDeletionCount > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>
            {t("settings:info.dataDir.title")}
          </h3>
          <p className={styles.hint}>
            {t("settings:info.dataDir.pending", {
              count: pendingDataDirectoryDeletionCount,
            })}
          </p>
          <button
            type="button"
            className={styles.applyAllBtn}
            onClick={onRetryDataDirectoryDeletion}
            disabled={retryingDataDirectoryDeletion}
          >
            {retryingDataDirectoryDeletion
              ? t("settings:info.dataDir.deleting")
              : t("settings:info.dataDir.retry")}
          </button>
          {dataDirectoryDeletionRetryResult === "success" && (
            <p className={styles.hint}>
              <StatusMark kind="success" />
              {t("settings:info.dataDir.success")}
            </p>
          )}
          {dataDirectoryDeletionRetryResult === "remaining" && (
            <p className={styles.hint}>
              <StatusMark kind="warning" />
              {t("settings:info.dataDir.remaining", {
                count: dataDirectoryDeletionRemainingCount,
              })}
            </p>
          )}
        </section>
      )}
    </>
  );
};
