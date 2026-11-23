import React from "react";
import { useTranslation } from "react-i18next";
import { useTabListKeyboard } from "@/hooks/useTabListKeyboard";
import styles from "./AppSettingsPanel.module.scss";
import {
  groupCategories,
  type DraftCategoryId,
  type SettingsCategoryDef,
  type SettingsCategoryId,
} from "./settingsCategories";

/** カテゴリ印（未適用 / 入力エラー）。記号は視覚用で、読み上げは非表示テキストに任せる */
export const CategoryStatusMark: React.FC<{
  unapplied: boolean;
  error: boolean;
}> = ({ unapplied, error }) => {
  const { t } = useTranslation();
  if (error) {
    return (
      <>
        <span aria-hidden="true" className={styles.statusError}>
          !
        </span>
        <span className={styles.visuallyHidden}>
          {t("settings:panel.status.error")}
        </span>
      </>
    );
  }
  if (unapplied) {
    return (
      <>
        <span aria-hidden="true" className={styles.statusDirty}>
          ●
        </span>
        <span className={styles.visuallyHidden}>
          {t("settings:panel.status.unapplied")}
        </span>
      </>
    );
  }
  return null;
};

interface SettingsCategoryNavProps {
  categories: readonly SettingsCategoryDef[];
  current: SettingsCategoryId;
  dirty: ReadonlySet<DraftCategoryId>;
  /** 入力エラーの印を付けるカテゴリ。無ければ null */
  errorCategory: SettingsCategoryId | null;
  /** ナビ項目の DOM id を作る（ページ本文の aria-labelledby から参照する） */
  itemId: (id: SettingsCategoryId) => string;
  onSelect: (id: SettingsCategoryId) => void;
}

/** デスクトップ用のサイドナビ。分類見出しの下にカテゴリのボタンを並べる */
export const SettingsCategoryNav: React.FC<SettingsCategoryNavProps> = ({
  categories,
  current,
  dirty,
  errorCategory,
  itemId,
  onSelect,
}) => {
  const { t } = useTranslation();
  const ids = categories.map((c) => c.id);
  const onKeyDown = useTabListKeyboard({
    ids,
    current,
    orientation: "vertical",
    onSelect,
    elementId: itemId,
  });

  return (
    <nav className={styles.nav} aria-label={t("settings:panel.nav.label")}>
      {groupCategories(categories).map((g) => (
        <div key={g.group} className={styles.navGroup}>
          <h3 className={styles.navGroupTitle}>
            {t(`settings:panel.nav.groups.${g.group}`)}
          </h3>
          <ul className={styles.navList}>
            {g.categories.map((c) => {
              const selected = c.id === current;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    id={itemId(c.id)}
                    className={`${styles.navItem} ${selected ? styles.navItemActive : ""}`}
                    aria-current={selected ? "page" : undefined}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => onSelect(c.id)}
                    onKeyDown={onKeyDown}
                  >
                    <span>{t(`settings:panel.categories.${c.id}.label`)}</span>
                    <CategoryStatusMark
                      error={errorCategory === c.id}
                      unapplied={dirty.has(c.id as DraftCategoryId)}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
};
