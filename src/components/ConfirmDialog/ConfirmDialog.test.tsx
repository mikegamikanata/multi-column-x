import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import i18n from "@/i18n";
import { expectAccessibleControls } from "@/test-utils/a11y";
import { expectNoJapanese } from "@/test-utils/japanese";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("確認メッセージが表示される", () => {
    render(
      <ConfirmDialog
        message="このアカウントを削除しますか？"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(
      screen.getByText("このアカウントを削除しますか？"),
    ).toBeInTheDocument();
  });

  it("OKでonConfirmが呼ばれる", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        message="このアカウントを削除しますか？"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("OK"));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("キャンセルでonCancelが呼ばれる", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        message="このアカウントを削除しますか？"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByText("キャンセル"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("Escapeでキャンセルされる", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        message="このアカウントを削除しますか？"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("ネイティブの閉じる要求(cancel)でもキャンセルされ、ダイアログは自動で閉じられない", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        message="このアカウントを削除しますか？"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    const dialog = screen.getByRole("dialog");
    const notPrevented = fireEvent(
      dialog,
      new Event("cancel", { cancelable: true }),
    );
    expect(onCancel).toHaveBeenCalledOnce();
    expect(notPrevented).toBe(false);
    expect(dialog).toHaveAttribute("open");
  });

  it("確認ダイアログは背景をクリックしても閉じない", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        message="このアカウントを削除しますか？"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole("dialog"));
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
  });

  it("titleとボタンラベルを任意指定できる", () => {
    render(
      <ConfirmDialog
        title="アカウント削除の確認"
        message="この操作は取り消せません"
        confirmLabel="削除する"
        cancelLabel="やめる"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("アカウント削除の確認")).toBeInTheDocument();
    expect(screen.getByText("削除する")).toBeInTheDocument();
    expect(screen.getByText("やめる")).toBeInTheDocument();
  });

  it("singleButton未指定時は確定・キャンセル両方のボタンが表示される", () => {
    render(
      <ConfirmDialog
        message="このアカウントを削除しますか？"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("OK")).toBeInTheDocument();
    expect(screen.getByText("キャンセル")).toBeInTheDocument();
  });

  it("singleButtonのときキャンセルボタンが表示されない", () => {
    render(
      <ConfirmDialog
        singleButton
        message="再認証に失敗しました"
        confirmLabel="OK"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("OK")).toBeInTheDocument();
    expect(screen.queryByText("キャンセル")).not.toBeInTheDocument();
  });

  describe("危険操作の表示", () => {
    it("危険操作の確認ダイアログでは確定ボタンが危険操作の見た目になる", () => {
      render(
        <ConfirmDialog
          variant="danger"
          message="このアカウントを削除しますか？"
          confirmLabel="削除する"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      const button = screen.getByRole("button", { name: "削除する" });
      expect(button.className).toContain("dangerBtn");
      expect(button.className).not.toContain("confirmBtn");
    });

    it("危険操作を指定しない確認ダイアログでは確定ボタンが主ボタンの見た目のままになる", () => {
      render(
        <ConfirmDialog
          message="このアカウントを削除しますか？"
          confirmLabel="削除する"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      const button = screen.getByRole("button", { name: "削除する" });
      expect(button.className).toContain("confirmBtn");
      expect(button.className).not.toContain("dangerBtn");
    });

    it("OKだけのお知らせダイアログでは確定ボタンが主ボタンの見た目のままになる", () => {
      render(
        <ConfirmDialog
          singleButton
          message="再認証に失敗しました"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      const button = screen.getByRole("button", { name: "OK" });
      expect(button.className).toContain("confirmBtn");
      expect(button.className).not.toContain("dangerBtn");
    });

    it("確認ダイアログ(取り消せない操作)を開くとキャンセルボタンにフォーカスが当たる", () => {
      render(
        <ConfirmDialog
          variant="danger"
          message="このアカウントを削除しますか？"
          confirmLabel="削除する"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expect(screen.getByRole("button", { name: "キャンセル" })).toHaveFocus();
      expect(
        screen.getByRole("button", { name: "削除する" }),
      ).not.toHaveFocus();
    });

    it("ボタンが1つだけの危険操作の確認ダイアログでは確定ボタンにフォーカスが当たる", () => {
      render(
        <ConfirmDialog
          variant="danger"
          singleButton
          message="削除しました"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expect(screen.getByRole("button", { name: "OK" })).toHaveFocus();
    });

    it("危険操作の確認ダイアログでもEscキーでキャンセルになる", () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();
      render(
        <ConfirmDialog
          variant="danger"
          message="このアカウントを削除しますか？"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />,
      );
      fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
      expect(onCancel).toHaveBeenCalledOnce();
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it("危険操作の確認ダイアログで確定ボタンを押すと確定になる", () => {
      const onConfirm = vi.fn();
      render(
        <ConfirmDialog
          variant="danger"
          message="このアカウントを削除しますか？"
          confirmLabel="削除する"
          onConfirm={onConfirm}
          onCancel={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "削除する" }));
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  describe("初期フォーカス", () => {
    it("確認ダイアログ(通常)を開くと確定ボタンにフォーカスが当たる", () => {
      render(
        <ConfirmDialog
          message="続行しますか？"
          confirmLabel="続行する"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expect(screen.getByRole("button", { name: "続行する" })).toHaveFocus();
    });

    it("確認ダイアログ(ボタンが1つだけ)を開くとOKボタンにフォーカスが当たる", () => {
      render(
        <ConfirmDialog
          singleButton
          message="再認証に失敗しました"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expect(screen.getByRole("button", { name: "OK" })).toHaveFocus();
    });
  });

  describe("ダイアログのアクセシビリティ", () => {
    it("見出しがあるときは見出しがダイアログの名前になる", () => {
      render(
        <ConfirmDialog
          title="アカウント削除の確認"
          message="この操作は取り消せません"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      const dialog = screen.getByRole("dialog", {
        name: "アカウント削除の確認",
      });
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(dialog).toHaveAccessibleDescription("この操作は取り消せません");
    });

    it("見出しが無いときは本文がダイアログの名前になる", () => {
      render(
        <ConfirmDialog
          message="再認証に失敗しました"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expect(
        screen.getByRole("dialog", { name: "再認証に失敗しました" }),
      ).toHaveAttribute("aria-modal", "true");
    });

    it("すべてのボタンにアクセシブルネームがある", () => {
      const { container } = render(
        <ConfirmDialog
          title="確認"
          message="削除しますか？"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expectAccessibleControls(container);
    });

    it("閉じたあと開く前にフォーカスしていた要素へフォーカスが戻る", () => {
      const opener = document.createElement("button");
      document.body.appendChild(opener);
      opener.focus();

      const { unmount } = render(
        <ConfirmDialog
          message="削除しますか？"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expect(screen.getByRole("button", { name: "OK" })).toHaveFocus();
      unmount();

      expect(opener).toHaveFocus();
      opener.remove();
    });
  });

  describe("表示言語", () => {
    afterEach(async () => {
      await i18n.changeLanguage("ja");
    });

    it("表示言語が英語のとき確認ダイアログの既定ラベルに日本語の文言が表示されない", async () => {
      await i18n.changeLanguage("en");
      const { container } = render(
        <ConfirmDialog
          title="Confirm"
          message="Delete this account?"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expectNoJapanese(container);
      expect(screen.getByText("OK")).toBeInTheDocument();
      expect(screen.getByText("Cancel")).toBeInTheDocument();
    });

    it("確認ダイアログを開いたまま表示言語を切り替えると既定ラベルも切り替わる", async () => {
      render(
        <ConfirmDialog
          message="Delete this account?"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expect(screen.getByText("キャンセル")).toBeInTheDocument();

      await act(async () => {
        await i18n.changeLanguage("en");
      });

      expect(screen.getByText("Cancel")).toBeInTheDocument();
      expect(screen.queryByText("キャンセル")).not.toBeInTheDocument();
    });

    it("呼び出し元が渡したラベルは表示言語に関わらずそのまま表示される", async () => {
      await i18n.changeLanguage("en");
      render(
        <ConfirmDialog
          message="Delete?"
          confirmLabel="Remove"
          cancelLabel="Keep"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expect(screen.getByText("Remove")).toBeInTheDocument();
      expect(screen.getByText("Keep")).toBeInTheDocument();
    });
  });
});
