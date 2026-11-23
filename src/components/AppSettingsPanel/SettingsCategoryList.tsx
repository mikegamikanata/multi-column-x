import React from "react";
import { useTranslation } from "react-i18next";
import styles from "./AppSettingsPanel.module.scss";
import {
  groupCategories,
  type DraftCategoryId,
  type SettingsCategoryDef,
  type SettingsCategoryId,
} from "./settingsCategories";
import { CategoryStatusMark } from "./SettingsCategoryNav";

interface SettingsCategoryListProps {
  categories: readonly SettingsCategoryDef[];
  dirty: ReadonlySet<DraftCategoryId>;
  errorCategory: SettingsCategoryId | null;
  onOpen: (id: SettingsCategoryId) => void;
}

/** Android 用のカテゴリ一覧。分類ごとに、内容の説明つきで並べる */
export const SettingsCategoryList: React.FC<SettingsCategoryListProps> = ({
  categories,
  dirty,
  errorCategory,
  onOpen,
}) => {
  const { t } = useTranslation();
  return (
    <div className={styles.categoryList}>
      {groupCategories(categories).map((g) => (
        <section key={g.group} className={styles.categoryGroup}>
          <h3 className={styles.navGroupTitle}>
            {t(`settings:panel.nav.groups.${g.group}`)}
          </h3>
          <ul className={styles.navList}>
            {g.categories.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={styles.categoryRow}
                  onClick={() => onOpen(c.id)}
                >
                  <span className={styles.categoryRowText}>
                    <span className={styles.categoryRowLabel}>
                      {t(`settings:panel.categories.${c.id}.label`)}
                      <CategoryStatusMark
                        error={errorCategory === c.id}
                        unapplied={dirty.has(c.id as DraftCategoryId)}
                      />
                    </span>
                    <span className={styles.categoryRowDesc}>
                      {t(`settings:panel.categories.${c.id}.desc`)}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={styles.categoryRowChevron}
                  >
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
};
