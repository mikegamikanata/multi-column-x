import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HelpPopover } from "@/components/HelpPopover/HelpPopover";
import { ModalDialog } from "@/components/ModalDialog/ModalDialog";
import { handleAndroidBack } from "@/lib/androidBackHandler";
import { expectAccessibleControls } from "@/test-utils/a11y";

describe("HelpPopover", () => {
  it("初期状態ではポップオーバーが表示されない", () => {
    render(<HelpPopover label="正規表現の書き方">説明文</HelpPopover>);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("トリガーボタンをクリックするとポップオーバーが表示され説明文が見える", () => {
    render(<HelpPopover label="正規表現の書き方">説明文</HelpPopover>);

    fireEvent.click(screen.getByRole("button", { name: "正規表現の書き方" }));

    const dialog = screen.getByRole("dialog", { name: "正規表現の書き方" });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent("説明文");
  });

  it("表示中に再度トリガーボタンをクリックすると閉じる", () => {
    render(<HelpPopover label="正規表現の書き方">説明文</HelpPopover>);

    const trigger = screen.getByRole("button", { name: "正規表現の書き方" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("表示中にEscapeキーを押すと閉じる", () => {
    render(<HelpPopover label="正規表現の書き方">説明文</HelpPopover>);

    const trigger = screen.getByRole("button", { name: "正規表現の書き方" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("表示中にポップオーバー外側をクリックすると閉じる", () => {
    render(
      <div>
        <div data-testid="outside">外側</div>
        <HelpPopover label="正規表現の書き方">説明文</HelpPopover>
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: "正規表現の書き方" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("トリガーボタンはアクセシブルネームを持ち開閉状態を aria-expanded で伝える", () => {
    const { container } = render(
      <HelpPopover label="正規表現の書き方">説明文</HelpPopover>,
    );
    expectAccessibleControls(container);

    const trigger = screen.getByRole("button", { name: "正規表現の書き方" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute(
      "aria-controls",
      screen.getByRole("dialog").id,
    );
  });

  it("ポップオーバーはモーダルではないので aria-modal を付けない", () => {
    render(<HelpPopover label="正規表現の書き方">説明文</HelpPopover>);

    fireEvent.click(screen.getByRole("button", { name: "正規表現の書き方" }));

    expect(screen.getByRole("dialog")).not.toHaveAttribute("aria-modal");
  });

  it("Escapeで閉じるとフォーカスが開いたトリガーへ戻る", () => {
    render(
      <HelpPopover label="正規表現の書き方">
        <button type="button">説明内のボタン</button>
      </HelpPopover>,
    );
    const trigger = screen.getByRole("button", { name: "正規表現の書き方" });
    fireEvent.click(trigger);
    const inner = screen.getByRole("button", { name: "説明内のボタン" });
    inner.focus();

    fireEvent.keyDown(inner, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("閉じているときのEscapeではフォーカスを動かさず、イベントも処理済みにしない", () => {
    render(<HelpPopover label="正規表現の書き方">説明文</HelpPopover>);
    const trigger = screen.getByRole("button", { name: "正規表現の書き方" });
    trigger.focus();

    const notPrevented = fireEvent.keyDown(trigger, { key: "Escape" });

    expect(trigger).toHaveFocus();
    expect(notPrevented).toBe(true);
  });

  it("開いているときのEscapeは処理済みとして扱われる（外側のダイアログに閉じさせないため）", () => {
    render(<HelpPopover label="正規表現の書き方">説明文</HelpPopover>);
    const trigger = screen.getByRole("button", { name: "正規表現の書き方" });
    fireEvent.click(trigger);

    const notPrevented = fireEvent.keyDown(trigger, { key: "Escape" });

    expect(notPrevented).toBe(false);
  });

  it("ダイアログの中でポップオーバーを開いてEscapeを押すとポップオーバーだけが閉じ、もう一度押すとダイアログが閉じる", () => {
    const onEscape = vi.fn();
    render(
      <ModalDialog aria-label="外側のダイアログ" onEscape={onEscape}>
        <HelpPopover label="正規表現の書き方">説明文</HelpPopover>
      </ModalDialog>,
    );
    const trigger = screen.getByRole("button", { name: "正規表現の書き方" });
    trigger.focus();
    fireEvent.click(trigger);

    fireEvent.keyDown(trigger, { key: "Escape" });

    expect(
      screen.queryByRole("dialog", { name: "正規表現の書き方" }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(onEscape).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "外側のダイアログ" }),
    ).toHaveAttribute("open");

    fireEvent.keyDown(trigger, { key: "Escape" });

    expect(onEscape).toHaveBeenCalledOnce();
  });

  describe("Androidの戻る操作", () => {
    it("開いている間の戻る操作でポップオーバーが閉じ、フォーカスがトリガーへ戻る", () => {
      render(<HelpPopover label="正規表現の書き方">説明文</HelpPopover>);
      const trigger = screen.getByRole("button", { name: "正規表現の書き方" });
      fireEvent.click(trigger);

      let handled = false;
      act(() => {
        handled = handleAndroidBack();
      });

      expect(handled).toBe(true);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });

    it("閉じているときの戻る操作は処理されない", () => {
      render(<HelpPopover label="正規表現の書き方">説明文</HelpPopover>);

      expect(handleAndroidBack()).toBe(false);
    });

    it("閉じた後の戻る操作は処理されない", () => {
      render(<HelpPopover label="正規表現の書き方">説明文</HelpPopover>);
      const trigger = screen.getByRole("button", { name: "正規表現の書き方" });
      fireEvent.click(trigger);
      fireEvent.click(trigger);

      expect(handleAndroidBack()).toBe(false);
    });

    it("ダイアログの中でポップオーバーを開いて戻る操作をするとポップオーバーだけが閉じ、もう一度でダイアログが閉じる", () => {
      const onEscape = vi.fn();
      render(
        <ModalDialog aria-label="外側のダイアログ" onEscape={onEscape}>
          <HelpPopover label="正規表現の書き方">説明文</HelpPopover>
        </ModalDialog>,
      );
      fireEvent.click(screen.getByRole("button", { name: "正規表現の書き方" }));

      act(() => {
        handleAndroidBack();
      });

      expect(
        screen.queryByRole("dialog", { name: "正規表現の書き方" }),
      ).not.toBeInTheDocument();
      expect(onEscape).not.toHaveBeenCalled();

      act(() => {
        handleAndroidBack();
      });

      expect(onEscape).toHaveBeenCalledOnce();
    });
  });
});
