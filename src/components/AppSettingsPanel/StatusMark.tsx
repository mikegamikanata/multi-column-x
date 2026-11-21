import React from "react";
import styles from "./AppSettingsPanel.module.scss";

interface StatusMarkProps {
  kind: "success" | "warning";
}

/** 成功・警告を色だけで伝えないための記号。読み上げは隣の本文に任せる */
export const StatusMark: React.FC<StatusMarkProps> = ({ kind }) => (
  <span className={styles.statusMark} aria-hidden="true" data-kind={kind}>
    {kind === "success" ? "✓" : "⚠"}
  </span>
);
