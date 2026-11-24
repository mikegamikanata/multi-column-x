import React, { useId } from "react";
import { useTranslation } from "react-i18next";
import { ModalDialog } from "@/components/ModalDialog/ModalDialog";
import type { WhatsNewEntry } from "@/lib/githubRelease";
import { RELEASES_PAGE_URL } from "@/lib/githubRelease";
import styles from "./WhatsNewDialog.module.scss";

interface Props {
  entries: WhatsNewEntry[];
  hasMore: boolean;
  onOpenReleasePage: () => void;
  onClose: () => void;
}

type Segment =
  | { type: "heading"; text: string }
  | { type: "list"; items: string[] }
  | { type: "paragraph"; text: string };

function parseNotes(notes: string): Segment[] {
  const lines = notes.split("\n");
  const segments: Segment[] = [];

  for (const line of lines) {
    if (/^#{2,3} /.test(line)) {
      segments.push({ type: "heading", text: line.replace(/^#{2,3} /, "") });
    } else if (/^[-*] /.test(line)) {
      const last = segments[segments.length - 1];
      if (last?.type === "list") {
        last.items.push(line.replace(/^[-*] /, ""));
      } else {
        segments.push({ type: "list", items: [line.replace(/^[-*] /, "")] });
      }
    } else if (line.trim() !== "") {
      segments.push({ type: "paragraph", text: line });
    }
    // 空行は無視
  }

  return segments;
}

function renderNotes(notes: string): React.ReactNode {
  const segments = parseNotes(notes);
  return segments.map((seg, i) => {
    switch (seg.type) {
      case "heading":
        return <h4 key={i}>{seg.text}</h4>;
      case "list":
        return (
          <ul key={i}>
            {seg.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        );
      case "paragraph":
        return <p key={i}>{seg.text}</p>;
    }
  });
}

export const WhatsNewDialog: React.FC<Props> = ({
  entries,
  hasMore,
  onOpenReleasePage,
  onClose,
}) => {
  const { t } = useTranslation();
  const titleId = useId();
  return (
    <ModalDialog
      className={styles.overlay}
      aria-labelledby={titleId}
      onEscape={onClose}
    >
      <div className={styles.dialog}>
        <h2 id={titleId} className={styles.title}>
          {t("dialogs:whatsNew.title")}
        </h2>
        <div className={styles.notes}>
          {entries.map((entry) => (
            <section key={entry.version}>
              <h3>
                {t("dialogs:whatsNew.versionHeading", {
                  version: entry.version,
                })}
              </h3>
              {renderNotes(entry.notes)}
            </section>
          ))}
        </div>
        {hasMore && (
          <p className={styles.moreNote}>{t("dialogs:whatsNew.moreNote")}</p>
        )}
        <p className={styles.releasesLinkRow}>
          <a
            className={styles.releasesLink}
            href={RELEASES_PAGE_URL}
            onClick={(e) => {
              // WebView 内での遷移を防ぎ、既定ブラウザで開く
              e.preventDefault();
              onOpenReleasePage();
            }}
          >
            {t("dialogs:whatsNew.releasesLink")}
          </a>
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.closeBtn}
            data-autofocus
            onClick={onClose}
          >
            {t("dialogs:whatsNew.close")}
          </button>
        </div>
      </div>
    </ModalDialog>
  );
};
