import React, { useCallback, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalDialog } from "@/components/ModalDialog/ModalDialog";
import { useTabListKeyboard } from "@/hooks/useTabListKeyboard";
import { isAutoReloadSupported } from "@/lib/autoReloadTarget";
import { nextColumnSettingsOnSmallImageChange } from "@/lib/scrollRestoreSetting";
import { useUnsavedChangesGuard } from "../../hooks/useUnsavedChangesGuard";
import {
  COLUMN_LABEL_MAX_LENGTH,
  normalizeColumnLabel,
  type Column,
  type ColumnSettings,
} from "../../types";
import { UnsavedChangesDialog } from "../UnsavedChangesDialog/UnsavedChangesDialog";
import {
  hasColumnSettingsChanges,
  type ColumnSettingsFormState,
} from "./columnSettingsChanges";
import {
  columnSettingsTabs,
  INITIAL_COLUMN_SETTINGS_TAB,
  LINE_LIST_ERROR_TAB,
  type ColumnSettingsTabId,
} from "./columnSettingsTabs";
import {
  nextLineListErrors,
  validateLineListInputs,
  type LineListErrors,
  type LineListTexts,
} from "./lineListInputs";
import styles from "./SettingsPanel.module.scss";
import {
  AutoReloadSection,
  CustomCssSection,
  DisplaySection,
  ImageBlurSection,
  ImageSection,
  NgWordsSection,
  NotificationSection,
  RepostHiddenUsersSection,
  WhitelistSection,
} from "./SettingsSections";

interface SettingsPanelProps {
  column: Column;
  onApply: (
    columnId: string,
    settings: ColumnSettings,
    width: number,
    label: string | undefined,
  ) => void;
  onClose: () => void;
  onReload?: (columnId: string) => void;
  isMobile: boolean;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  column,
  onApply,
  onClose,
  onReload,
  isMobile,
}) => {
  const { t } = useTranslation();
  const titleId = useId();

  const tabs = columnSettingsTabs(column);
  const [activeTab, setActiveTab] = useState<ColumnSettingsTabId>(
    INITIAL_COLUMN_SETTINGS_TAB,
  );
  const tabIdPrefix = useId();
  const panelId = `${tabIdPrefix}-panel`;
  const tabElementId = useCallback(
    (id: ColumnSettingsTabId) => `${tabIdPrefix}-tab-${id}`,
    [tabIdPrefix],
  );
  const onTabKeyDown = useTabListKeyboard({
    ids: tabs ?? [],
    current: activeTab,
    orientation: "horizontal",
    onSelect: setActiveTab,
    elementId: tabElementId,
  });

  // マウント時の値を1回だけ保持し、未適用の変更の判定に使う
  const [initialForm] = useState<ColumnSettingsFormState>(() => ({
    settings: { ...column.settings },
    width: column.width,
    labelText: column.label ?? "",
    lineListTexts: {
      ngWords: (column.settings.ngWords ?? []).join("\n"),
      repostHiddenUserIds: (column.settings.repostHiddenUserIds ?? []).join(
        "\n",
      ),
      whitelistWords: (column.settings.whitelistWords ?? []).join("\n"),
    },
  }));
  const [settings, setSettings] = useState<ColumnSettings>(
    initialForm.settings,
  );
  const [width, setWidth] = useState<number>(initialForm.width);
  const [labelText, setLabelText] = useState<string>(initialForm.labelText);
  const [lineListTexts, setLineListTexts] = useState<LineListTexts>(
    initialForm.lineListTexts,
  );
  const guard = useUnsavedChangesGuard(
    hasColumnSettingsChanges(initialForm, {
      settings,
      width,
      labelText,
      lineListTexts,
    }),
    onClose,
  );
  // 確認メッセージ自身が Esc を処理するため、表示中はパネル側の Esc を無効にする
  const noop = useCallback(() => {}, []);
  const [lineListErrors, setLineListErrors] = useState<LineListErrors>({
    ngWords: null,
    repostHiddenUserIds: null,
    whitelistWords: null,
  });

  const updateSetting = <K extends keyof ColumnSettings>(
    key: K,
    value: ColumnSettings[K],
  ) =>
    setSettings((s) =>
      key === "smallImageEnabled"
        ? nextColumnSettingsOnSmallImageChange(s, value as boolean)
        : { ...s, [key]: value },
    );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateLineListInputs(lineListTexts, t);
    setLineListErrors((prev) => nextLineListErrors(prev, result));
    if (result.kind === "invalid") {
      setActiveTab(LINE_LIST_ERROR_TAB);
      return;
    }

    onApply(
      column.id,
      { ...settings, ...result.values },
      width,
      normalizeColumnLabel(labelText),
    );
  };

  const hasLineListError = Object.values(lineListErrors).some(
    (e) => e !== null,
  );

  const columnSection = (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>
        {t("columnSettings:column.title")}
      </h3>
      <label className={styles.fieldLabelBlock}>
        {t("columnSettings:column.label")}
        <input
          type="text"
          className={styles.labelInput}
          value={labelText}
          onChange={(e) => setLabelText(e.target.value)}
          maxLength={COLUMN_LABEL_MAX_LENGTH}
          placeholder={t("columnSettings:column.labelPlaceholder")}
        />
      </label>
      {!isMobile && (
        <label className={styles.fieldLabel}>
          {t("columnSettings:column.width")}
          <input
            type="number"
            className={styles.numberInput}
            min={200}
            max={1200}
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
          />
        </label>
      )}
    </section>
  );

  const autoReloadSection = isAutoReloadSupported(column) && (
    <AutoReloadSection settings={settings} updateSetting={updateSetting} />
  );

  const customCssSection = (
    <CustomCssSection settings={settings} updateSetting={updateSetting} />
  );

  const renderTab = (id: ColumnSettingsTabId) => {
    switch (id) {
      case "basic":
        return (
          <>
            {columnSection}
            {autoReloadSection}
            {!isMobile && (
              <NotificationSection
                settings={settings}
                updateSetting={updateSetting}
              />
            )}
          </>
        );
      case "view":
        return (
          <>
            <DisplaySection
              settings={settings}
              updateSetting={updateSetting}
              showReturnToLastRead={column.pageType === "home"}
            />
            <ImageSection settings={settings} updateSetting={updateSetting} />
            <ImageBlurSection
              settings={settings}
              updateSetting={updateSetting}
            />
          </>
        );
      case "filter":
        return (
          <>
            <NgWordsSection
              text={lineListTexts.ngWords}
              error={lineListErrors.ngWords}
              onChange={(value) =>
                setLineListTexts((prev) => ({ ...prev, ngWords: value }))
              }
            />
            <RepostHiddenUsersSection
              text={lineListTexts.repostHiddenUserIds}
              error={lineListErrors.repostHiddenUserIds}
              onChange={(value) =>
                setLineListTexts((prev) => ({
                  ...prev,
                  repostHiddenUserIds: value,
                }))
              }
            />
            <WhitelistSection
              text={lineListTexts.whitelistWords}
              error={lineListErrors.whitelistWords}
              onChange={(value) =>
                setLineListTexts((prev) => ({
                  ...prev,
                  whitelistWords: value,
                }))
              }
              settings={settings}
              updateSetting={updateSetting}
            />
          </>
        );
      case "css":
        return customCssSection;
    }
  };

  return (
    <ModalDialog
      className={styles.overlay}
      aria-labelledby={titleId}
      onEscape={guard.confirmOpen ? noop : guard.requestClose}
    >
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {t("columnSettings:title")}
          </h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={guard.requestClose}
            aria-label={t("columnSettings:close")}
          >
            ✕
          </button>
        </div>

        {tabs !== null && (
          <div
            className={styles.tabs}
            role="tablist"
            aria-label={t("columnSettings:tabs.label")}
          >
            {tabs.map((id) => {
              const selected = id === activeTab;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={tabElementId(id)}
                  aria-selected={selected}
                  aria-controls={selected ? panelId : undefined}
                  tabIndex={selected ? 0 : -1}
                  data-autofocus={selected ? "" : undefined}
                  className={`${styles.tab} ${selected ? styles.tabActive : ""}`}
                  onClick={() => setActiveTab(id)}
                  onKeyDown={onTabKeyDown}
                >
                  {t(`columnSettings:tabs.${id}`)}
                  {id === LINE_LIST_ERROR_TAB && hasLineListError && (
                    <>
                      {" "}
                      <span aria-hidden="true" className={styles.tabError}>
                        !
                      </span>
                      <span className={styles.visuallyHidden}>
                        {t("columnSettings:tabs.hasError")}
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          {tabs === null ? (
            <>
              {columnSection}
              {customCssSection}
            </>
          ) : (
            <div
              role="tabpanel"
              id={panelId}
              aria-labelledby={tabElementId(activeTab)}
            >
              {renderTab(activeTab)}
            </div>
          )}

          <div className={styles.actions}>
            {onReload && (
              <button
                type="button"
                className={styles.reloadBtn}
                onClick={() => {
                  onClose();
                  onReload(column.id);
                }}
              >
                {t("columnSettings:actions.reload")}
              </button>
            )}
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
            >
              {t("columnSettings:actions.cancel")}
            </button>
            <button type="submit" className={styles.applyBtn}>
              {t("columnSettings:actions.apply")}
            </button>
          </div>
        </form>
      </div>
      {guard.confirmOpen && (
        <UnsavedChangesDialog
          onDiscard={guard.confirmDiscard}
          onBack={guard.cancelConfirm}
        />
      )}
    </ModalDialog>
  );
};
