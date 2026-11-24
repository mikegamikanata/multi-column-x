import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import i18n from "@/i18n";
import { expectAccessibleControls } from "@/test-utils/a11y";
import { expectNoJapanese } from "@/test-utils/japanese";
import { TabActionDialog } from "./TabActionDialog";

const defaultProps = {
  columnLabel: "テストカラム",
  onReload: vi.fn(),
  onSettings: vi.fn(),
  onRemove: vi.fn(),
  onClose: vi.fn(),
};

describe("TabActionDialog", () => {
  it("カラムラベルが表示される", () => {
    render(<TabActionDialog {...defaultProps} />);
    expect(screen.getByText("テストカラム")).toBeInTheDocument();
  });

  it("再読み込みボタンをクリックすると onReload が呼ばれる", () => {
    const onReload = vi.fn();
    render(<TabActionDialog {...defaultProps} onReload={onReload} />);
    fireEvent.click(screen.getByText(/再読み込み/));
    expect(onReload).toHaveBeenCalled();
  });

  it("設定ボタンをクリックすると onSettings が呼ばれる", () => {
    const onSettings = vi.fn();
    render(<TabActionDialog {...defaultProps} onSettings={onSettings} />);
    fireEvent.click(screen.getByText(/設定/));
    expect(onSettings).toHaveBeenCalled();
  });

  it("削除ボタンをクリックすると onRemove が呼ばれる", () => {
    const onRemove = vi.fn();
    render(<TabActionDialog {...defaultProps} onRemove={onRemove} />);
    fireEvent.click(screen.getByText(/削除/));
    expect(onRemove).toHaveBeenCalled();
  });

  it("設定ボタンに settings SVG が表示される", () => {
    render(<TabActionDialog {...defaultProps} />);
    const settingsBtn = screen.getByText(/設定/).closest("button");
    expect(
      settingsBtn?.querySelector('[data-testid="icon-settings"]'),
    ).toBeInTheDocument();
  });

  it("削除ボタンに close SVG が表示される", () => {
    render(<TabActionDialog {...defaultProps} />);
    const removeBtn = screen.getByText(/削除/).closest("button");
    expect(
      removeBtn?.querySelector('[data-testid="icon-close"]'),
    ).toBeInTheDocument();
  });

  it("ダイアログとして開かれ role=dialog が一つだけ存在する", () => {
    render(<TabActionDialog {...defaultProps} />);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("タブ操作ダイアログを開くと先頭の操作ボタンにフォーカスが当たる", () => {
    render(<TabActionDialog {...defaultProps} />);
    expect(screen.getByRole("button", { name: /再読み込み/ })).toHaveFocus();
  });

  it("Escape キーで onClose が呼ばれる", () => {
    const onClose = vi.fn();
    render(<TabActionDialog {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("ネイティブの閉じる要求(cancel)でも onClose が呼ばれる", () => {
    const onClose = vi.fn();
    render(<TabActionDialog {...defaultProps} onClose={onClose} />);
    fireEvent(
      screen.getByRole("dialog"),
      new Event("cancel", { cancelable: true }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("タブ操作ダイアログは背景をクリックすると閉じる", () => {
    const onClose = vi.fn();
    render(<TabActionDialog {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("シートクリックでは onClose が呼ばれない", () => {
    const onClose = vi.fn();
    render(<TabActionDialog {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText("テストカラム"));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("TabActionDialog のダイアログのアクセシビリティ", () => {
  it("カラム名がダイアログの名前になり aria-modal が付く", () => {
    render(<TabActionDialog {...defaultProps} />);
    expect(
      screen.getByRole("dialog", { name: "テストカラム" }),
    ).toHaveAttribute("aria-modal", "true");
  });

  it("すべてのボタンにアクセシブルネームがある", () => {
    const { container } = render(<TabActionDialog {...defaultProps} />);
    expectAccessibleControls(container);
  });

  it("閉じたあと開く前にフォーカスしていた要素へフォーカスが戻る", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = render(<TabActionDialog {...defaultProps} />);
    expect(screen.getByRole("button", { name: /再読み込み/ })).toHaveFocus();
    unmount();

    expect(opener).toHaveFocus();
    opener.remove();
  });
});

describe("TabActionDialog の表示言語", () => {
  it("表示言語が英語のときタブ操作ダイアログに日本語の文言が表示されない", async () => {
    await i18n.changeLanguage("en");
    const { container } = render(
      <TabActionDialog {...defaultProps} columnLabel="Test column" />,
    );
    expectNoJapanese(container);
    expect(screen.getByRole("button", { name: /Reload/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Settings/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Delete/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });
});
