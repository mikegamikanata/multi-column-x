import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import type { WhatsNewEntry } from "@/lib/githubRelease";
import { RELEASES_PAGE_URL } from "@/lib/githubRelease";
import { expectAccessibleControls } from "@/test-utils/a11y";
import { expectNoJapanese } from "@/test-utils/japanese";
import { WhatsNewDialog } from "./WhatsNewDialog";

interface RenderOptions {
  entries?: WhatsNewEntry[];
  hasMore?: boolean;
  onOpenReleasePage?: () => void;
  onClose?: () => void;
}

function renderDialog({
  entries = [],
  hasMore = false,
  onOpenReleasePage = vi.fn(),
  onClose = vi.fn(),
}: RenderOptions = {}) {
  return render(
    <WhatsNewDialog
      entries={entries}
      hasMore={hasMore}
      onOpenReleasePage={onOpenReleasePage}
      onClose={onClose}
    />,
  );
}

function entry(version: string, notes: string = `- ${version}の変更`) {
  return { version, notes };
}

describe("WhatsNewDialog", () => {
  it("複数バージョンが新しい順に見出し付きで表示される", () => {
    renderDialog({
      entries: [
        entry("0.9.1", "- 変更A"),
        entry("0.9.0", "- 変更B"),
        entry("0.8.1", "- 変更C"),
      ],
    });

    const headings = screen
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(headings).toEqual([
      "バージョン 0.9.1",
      "バージョン 0.9.0",
      "バージョン 0.8.1",
    ]);
    expect(screen.getByText("変更A")).toBeInTheDocument();
    expect(screen.getByText("変更B")).toBeInTheDocument();
    expect(screen.getByText("変更C")).toBeInTheDocument();
  });

  it("notesの見出し行が h4 として描画され # マーカーが表示されない", () => {
    renderDialog({
      entries: [entry("0.9.1", "### 新機能\n- 項目A\n- 項目B")],
    });

    expect(
      screen.getByRole("heading", { level: 4, name: "新機能" }),
    ).toBeInTheDocument();
    // "#" マーカーが文字としてそのまま出ていないこと
    expect(screen.queryByText(/^###/)).not.toBeInTheDocument();
  });

  it("範囲内のバージョンが4件以上あるとき省略の注記を出す", () => {
    renderDialog({ entries: [entry("0.9.1")], hasMore: true });

    expect(
      screen.getByText(
        "これより前のバージョンの変更内容は、リリースページで確認できます。",
      ),
    ).toBeInTheDocument();
  });

  it("範囲内のバージョンが3件以下のとき省略の注記は表示しない", () => {
    renderDialog({ entries: [entry("0.9.1")], hasMore: false });

    expect(
      screen.queryByText(/これより前のバージョンの変更内容/),
    ).not.toBeInTheDocument();
  });

  it.each([false, true])(
    "更新内容ダイアログにはリリースページへのリンクが常に表示される(hasMore=%s)",
    (hasMore) => {
      renderDialog({ entries: [entry("0.9.1")], hasMore });

      expect(
        screen.getByRole("link", {
          name: "リリースページで過去の変更内容を確認する",
        }),
      ).toHaveAttribute("href", RELEASES_PAGE_URL);
    },
  );

  it("リンクを選ぶとリリースページが開かれ、ダイアログは閉じない", () => {
    const onOpenReleasePage = vi.fn();
    const onClose = vi.fn();
    renderDialog({
      entries: [entry("0.9.1")],
      onOpenReleasePage,
      onClose,
    });

    const link = screen.getByRole("link", {
      name: "リリースページで過去の変更内容を確認する",
    });
    // fireEvent.click は既定動作が阻止されなかったとき true を返す
    const notPrevented = fireEvent.click(link);

    expect(onOpenReleasePage).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    expect(notPrevented).toBe(false);
  });

  it("タイトルが表示される", () => {
    renderDialog();
    expect(
      screen.getByRole("heading", { level: 2, name: "アプリが更新されました" }),
    ).toBeInTheDocument();
  });

  it("notesのリスト行が li として描画され - マーカーが表示されない", () => {
    renderDialog({
      entries: [entry("0.9.1", "### 新機能\n- 項目A\n- 項目B")],
    });
    expect(screen.getByText("項目A")).toBeInTheDocument();
    expect(screen.getByText("項目B")).toBeInTheDocument();
    // "- " マーカーが文字としてそのまま出ていないこと
    expect(screen.queryByText(/^- 項目A/)).not.toBeInTheDocument();
  });

  it("閉じるクリックで onClose が呼ばれる", () => {
    const onClose = vi.fn();
    renderDialog({ entries: [entry("0.9.1")], onClose });
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("notesにHTML文字列が含まれてもXSSにならずテキストとして表示される", () => {
    const xssNotes = "<img src=x onerror=alert(1)>";
    renderDialog({ entries: [entry("0.9.1", xssNotes)] });
    // img 要素として解釈されていないこと
    expect(document.querySelector("img")).not.toBeInTheDocument();
    // 生テキストとして存在すること
    expect(
      document.body.textContent?.includes("<img src=x onerror=alert(1)>"),
    ).toBe(true);
  });

  it("## プレフィックスの見出し行も h4 として描画される", () => {
    renderDialog({ entries: [entry("0.9.1", "## 修正内容\n- 不具合修正")] });
    expect(
      screen.getByRole("heading", { level: 4, name: "修正内容" }),
    ).toBeInTheDocument();
  });

  it("* プレフィックスのリスト行も li として描画される", () => {
    renderDialog({ entries: [entry("0.9.1", "* 改善点")] });
    expect(screen.getByText("改善点")).toBeInTheDocument();
  });

  it("見出しでもリストでもない行は p として描画される", () => {
    renderDialog({ entries: [entry("0.9.1", "通常テキスト行")] });
    expect(screen.getByText("通常テキスト行")).toBeInTheDocument();
  });

  describe("ダイアログのアクセシビリティ", () => {
    it("見出しがダイアログの名前になり aria-modal が付く", () => {
      renderDialog();
      expect(
        screen.getByRole("dialog", { name: "アプリが更新されました" }),
      ).toHaveAttribute("aria-modal", "true");
    });

    it("更新後の更新内容を開くと閉じるボタンにフォーカスが当たる", () => {
      renderDialog();
      expect(screen.getByRole("button", { name: "閉じる" })).toHaveFocus();
    });

    it("Escapeで閉じる", () => {
      const onClose = vi.fn();
      renderDialog({ onClose });
      fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
      expect(onClose).toHaveBeenCalledOnce();
    });

    it("ネイティブの閉じる要求(cancel)でも閉じる操作になる", () => {
      const onClose = vi.fn();
      renderDialog({ onClose });
      fireEvent(
        screen.getByRole("dialog"),
        new Event("cancel", { cancelable: true }),
      );
      expect(onClose).toHaveBeenCalledOnce();
    });

    it("ボタンとリンクにアクセシブルネームがある", () => {
      const { container } = renderDialog({
        entries: [entry("0.9.1", "### 新機能")],
      });
      expectAccessibleControls(container);
    });

    it("閉じたあと開く前にフォーカスしていた要素へフォーカスが戻る", () => {
      const opener = document.createElement("button");
      document.body.appendChild(opener);
      opener.focus();

      const { unmount } = renderDialog();
      expect(screen.getByRole("button", { name: "閉じる" })).toHaveFocus();
      unmount();

      expect(opener).toHaveFocus();
      opener.remove();
    });
  });

  describe("表示言語", () => {
    afterEach(async () => {
      await i18n.changeLanguage("ja");
    });

    it("更新内容ダイアログの文言は表示言語に従う: 英語のとき注記・リンク・版見出しに日本語が表示されない", async () => {
      await i18n.changeLanguage("en");
      const { container } = renderDialog({
        entries: [
          entry("0.9.1", "### New features\n- Item A\n\nPlain line"),
          entry("0.9.0", "- Item B"),
        ],
        hasMore: true,
      });

      expectNoJapanese(container);
      expect(
        screen.getByRole("heading", { name: "The app has been updated" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { level: 3, name: "Version 0.9.1" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Changes in earlier versions are available on the release page.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", {
          name: "View past changes on the release page",
        }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    });
  });
});
