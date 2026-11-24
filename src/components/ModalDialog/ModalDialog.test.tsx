import { act, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, createRef, type ReactNode } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { handleAndroidBack } from "@/lib/androidBackHandler";
import { ModalDialog } from "./ModalDialog";

describe("ModalDialog", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("開くとモーダルとして表示され、子要素が描画される", () => {
    render(
      <ModalDialog aria-labelledby="t">
        <h2 id="t">題名</h2>
      </ModalDialog>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("open");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("題名");
  });

  it("StrictModeでもshowModalは1回だけで例外にならない", () => {
    const original = HTMLDialogElement.prototype.showModal;
    const showModal = vi
      .spyOn(HTMLDialogElement.prototype, "showModal")
      .mockImplementation(function (this: HTMLDialogElement) {
        // 実ブラウザと同じく、開いているダイアログへの再呼び出しは例外にする
        if (this.open)
          throw new DOMException("already open", "InvalidStateError");
        original.call(this);
      });
    render(
      <StrictMode>
        <ModalDialog aria-label="x" />
      </StrictMode>,
    );
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
  });

  it("data-autofocusを付けた要素が初期フォーカスを受ける", () => {
    render(
      <ModalDialog aria-label="x">
        <button>最初</button>
        <button data-autofocus>対象</button>
      </ModalDialog>,
    );
    expect(screen.getByRole("button", { name: "対象" })).toHaveFocus();
  });

  it("data-autofocusの要素がdisabledで操作要素も無いときはdialog自身にフォーカスする", () => {
    render(
      <ModalDialog aria-label="x">
        <button data-autofocus disabled>
          無効
        </button>
      </ModalDialog>,
    );
    expect(screen.getByRole("dialog")).toHaveFocus();
  });

  it("EscapeキーでonEscapeが呼ばれ、既定動作とdocumentへの伝播が止められる", () => {
    const onEscape = vi.fn();
    const onDocumentKeyDown = vi.fn();
    document.addEventListener("keydown", onDocumentKeyDown);
    try {
      render(
        <ModalDialog aria-label="x" onEscape={onEscape}>
          <button>ボタン</button>
        </ModalDialog>,
      );
      const notCancelled = fireEvent.keyDown(
        screen.getByRole("button", { name: "ボタン" }),
        { key: "Escape" },
      );
      expect(onEscape).toHaveBeenCalledTimes(1);
      expect(notCancelled).toBe(false); // preventDefault 済み
      expect(onDocumentKeyDown).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", onDocumentKeyDown);
    }
  });

  it("子の部品が先にEscapeを処理済み(preventDefault済み)ならonEscapeを呼ばない", () => {
    const onEscape = vi.fn();
    render(
      <ModalDialog aria-label="x" onEscape={onEscape}>
        <button
          onKeyDown={(e) => {
            if (e.key === "Escape") e.preventDefault();
          }}
        >
          ボタン
        </button>
      </ModalDialog>,
    );
    fireEvent.keyDown(screen.getByRole("button", { name: "ボタン" }), {
      key: "Escape",
    });
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("ネイティブのcancelイベントでもonEscapeが呼ばれ、自動closeは抑止される", () => {
    const onEscape = vi.fn();
    render(<ModalDialog aria-label="x" onEscape={onEscape} />);
    const dialog = screen.getByRole("dialog");
    const cancel = new Event("cancel", { cancelable: true });
    fireEvent(dialog, cancel);
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(cancel.defaultPrevented).toBe(true);
  });

  it("入れ子のダイアログでは内側のEscが外側へ伝わらず、内側だけが閉じる", () => {
    const onOuterEscape = vi.fn();
    const onInnerEscape = vi.fn();
    render(
      <ModalDialog aria-label="外" onEscape={onOuterEscape}>
        <ModalDialog aria-label="内" onEscape={onInnerEscape}>
          <button>内側ボタン</button>
        </ModalDialog>
      </ModalDialog>,
    );
    fireEvent.keyDown(screen.getByRole("button", { name: "内側ボタン" }), {
      key: "Escape",
    });
    expect(onInnerEscape).toHaveBeenCalledTimes(1);
    expect(onOuterEscape).not.toHaveBeenCalled();
  });

  it("ネイティブにcloseされてもmount中なら開き直す", () => {
    render(<ModalDialog aria-label="x" />);
    const dialog = screen.getByRole("dialog") as HTMLDialogElement;
    dialog.close();
    expect(dialog).toHaveAttribute("open");
  });

  it("閉じる(アンマウント)と開く前にフォーカスしていた要素へフォーカスが戻る", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = render(
      <ModalDialog aria-label="x">
        <button data-autofocus>中のボタン</button>
      </ModalDialog>,
    );
    expect(screen.getByRole("button", { name: "中のボタン" })).toHaveFocus();
    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("最後の操作要素でTabを押すとダイアログ内の最初の操作要素へ戻る", () => {
    render(
      <>
        <button>外のツールバー</button>
        <ModalDialog aria-label="x">
          <button>最初</button>
          <button>中間</button>
          <button>最後</button>
        </ModalDialog>
      </>,
    );
    const last = screen.getByRole("button", { name: "最後" });
    last.focus();
    const notCancelled = fireEvent.keyDown(last, { key: "Tab" });
    expect(notCancelled).toBe(false);
    expect(screen.getByRole("button", { name: "最初" })).toHaveFocus();
  });

  it("最初の操作要素でShift+Tabを押すとダイアログ内の最後の操作要素へ移る", () => {
    render(
      <>
        <button>外のツールバー</button>
        <ModalDialog aria-label="x">
          <button>最初</button>
          <button>最後</button>
        </ModalDialog>
      </>,
    );
    const first = screen.getByRole("button", { name: "最初" });
    first.focus();
    const notCancelled = fireEvent.keyDown(first, {
      key: "Tab",
      shiftKey: true,
    });
    expect(notCancelled).toBe(false);
    expect(screen.getByRole("button", { name: "最後" })).toHaveFocus();
  });

  it("中間の操作要素ではTabを折り返さずブラウザの既定に任せる", () => {
    render(
      <ModalDialog aria-label="x">
        <button>最初</button>
        <button>中間</button>
        <button>最後</button>
      </ModalDialog>,
    );
    const middle = screen.getByRole("button", { name: "中間" });
    middle.focus();
    expect(fireEvent.keyDown(middle, { key: "Tab" })).toBe(true);
    expect(fireEvent.keyDown(middle, { key: "Tab", shiftKey: true })).toBe(
      true,
    );
    expect(middle).toHaveFocus();
  });

  it("折り返しの対象からdisabledの要素は除外される", () => {
    render(
      <ModalDialog aria-label="x">
        <button>最初</button>
        <button>最後の有効</button>
        <button disabled>無効</button>
      </ModalDialog>,
    );
    const target = screen.getByRole("button", { name: "最後の有効" });
    target.focus();
    expect(fireEvent.keyDown(target, { key: "Tab" })).toBe(false);
    expect(screen.getByRole("button", { name: "最初" })).toHaveFocus();
  });

  it("折り返しの対象からtabIndexが-1の要素は除外される", () => {
    render(
      <ModalDialog aria-label="x">
        <button>最初</button>
        <button>最後のタブ到達可能</button>
        <button tabIndex={-1}>タブ外</button>
      </ModalDialog>,
    );
    const target = screen.getByRole("button", { name: "最後のタブ到達可能" });
    target.focus();
    expect(fireEvent.keyDown(target, { key: "Tab" })).toBe(false);
    expect(screen.getByRole("button", { name: "最初" })).toHaveFocus();
  });

  describe("折り返しの対象外になる要素", () => {
    const cases: [string, ReactNode][] = [
      ["hidden属性の要素", <button hidden>除外</button>],
      [
        "hidden属性を持つ祖先の内側の要素",
        <div hidden>
          <button>除外</button>
        </div>,
      ],
      [
        "inert属性を持つ祖先の内側の要素",
        <div inert>
          <button>除外</button>
        </div>,
      ],
      ["display:noneの要素", <button style={{ display: "none" }}>除外</button>],
      [
        "visibility:hiddenの要素",
        <button style={{ visibility: "hidden" }}>除外</button>,
      ],
    ];
    it.each(cases)("%sは除外される", (_name, excluded) => {
      render(
        <ModalDialog aria-label="x">
          <button>最初</button>
          <button>最後の可視</button>
          {excluded}
        </ModalDialog>,
      );
      const target = screen.getByRole("button", { name: "最後の可視" });
      target.focus();
      expect(fireEvent.keyDown(target, { key: "Tab" })).toBe(false);
      expect(screen.getByRole("button", { name: "最初" })).toHaveFocus();
    });
  });

  it("入れ子の別ダイアログ内の要素は外側ダイアログの折り返し対象に入らない", () => {
    render(
      <ModalDialog aria-label="外">
        <button>外の最初</button>
        <button>外の最後</button>
        <ModalDialog aria-label="内">
          <button>内のボタン</button>
        </ModalDialog>
      </ModalDialog>,
    );
    const target = screen.getByRole("button", { name: "外の最後" });
    target.focus();
    expect(fireEvent.keyDown(target, { key: "Tab" })).toBe(false);
    expect(screen.getByRole("button", { name: "外の最初" })).toHaveFocus();
  });

  it("入れ子の内側ダイアログの唯一の要素でTabを押すと内側にとどまる", () => {
    render(
      <ModalDialog aria-label="外">
        <button>外のボタン</button>
        <ModalDialog aria-label="内">
          <button>内のボタン</button>
        </ModalDialog>
      </ModalDialog>,
    );
    const inner = screen.getByRole("button", { name: "内のボタン" });
    inner.focus();
    expect(fireEvent.keyDown(inner, { key: "Tab" })).toBe(false);
    expect(inner).toHaveFocus();
  });

  it("最後の要素より後ろのタブ非到達要素にフォーカスがあるときTabで最初の要素へ折り返す", () => {
    render(
      <ModalDialog aria-label="x">
        <button>最初</button>
        <button>最後</button>
        <button tabIndex={-1}>後ろのタブ外</button>
      </ModalDialog>,
    );
    const after = screen.getByRole("button", { name: "後ろのタブ外" });
    after.focus();
    expect(fireEvent.keyDown(after, { key: "Tab" })).toBe(false);
    expect(screen.getByRole("button", { name: "最初" })).toHaveFocus();
  });

  it("最初の要素より前のタブ非到達要素にフォーカスがあるときShift+Tabで最後の要素へ折り返す", () => {
    render(
      <ModalDialog aria-label="x">
        <button tabIndex={-1}>前のタブ外</button>
        <button>最初</button>
        <button>最後</button>
      </ModalDialog>,
    );
    const before = screen.getByRole("button", { name: "前のタブ外" });
    before.focus();
    expect(fireEvent.keyDown(before, { key: "Tab", shiftKey: true })).toBe(
      false,
    );
    expect(screen.getByRole("button", { name: "最後" })).toHaveFocus();
  });

  it("フォーカスが入れ子の内側ダイアログの中間にあるとき外側は折り返さない", () => {
    render(
      <ModalDialog aria-label="外">
        <button>外の最初</button>
        <button>外の最後</button>
        <ModalDialog aria-label="内">
          <button>内の最初</button>
          <button>内の最後</button>
        </ModalDialog>
      </ModalDialog>,
    );
    const innerFirst = screen.getByRole("button", { name: "内の最初" });
    innerFirst.focus();
    // 中間（内側の最後ではない）なのでブラウザの既定に任せる = preventDefault されない
    expect(fireEvent.keyDown(innerFirst, { key: "Tab" })).toBe(true);
    expect(innerFirst).toHaveFocus();
  });

  it("フォーカスがダイアログの外にあるときTabで最初の要素・Shift+Tabで最後の要素へ引き戻す", () => {
    render(
      <>
        <button>外の前</button>
        <ModalDialog aria-label="x">
          <button>最初</button>
          <button>最後</button>
        </ModalDialog>
        <button>外の後</button>
      </>,
    );
    const dialog = screen.getByRole("dialog");
    for (const name of ["外の前", "外の後"]) {
      const outside = screen.getByRole("button", { name });
      outside.focus();
      expect(fireEvent.keyDown(dialog, { key: "Tab" })).toBe(false);
      expect(screen.getByRole("button", { name: "最初" })).toHaveFocus();

      outside.focus();
      expect(fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true })).toBe(
        false,
      );
      expect(screen.getByRole("button", { name: "最後" })).toHaveFocus();
    }
  });

  it("ダイアログ自身にフォーカスがあるときTabで最初の要素・Shift+Tabで最後の要素へ移る", () => {
    render(
      <ModalDialog aria-label="x">
        <button>最初</button>
        <button>最後</button>
      </ModalDialog>,
    );
    const dialog = screen.getByRole("dialog");
    dialog.focus();
    expect(fireEvent.keyDown(dialog, { key: "Tab" })).toBe(false);
    expect(screen.getByRole("button", { name: "最初" })).toHaveFocus();

    dialog.focus();
    expect(fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true })).toBe(
      false,
    );
    expect(screen.getByRole("button", { name: "最後" })).toHaveFocus();
  });

  it("操作要素が1つも無いときTabはdialog自身にフォーカスを留める", () => {
    render(
      <ModalDialog aria-label="x">
        <p>説明だけ</p>
        <button disabled>無効</button>
      </ModalDialog>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveFocus();
    (document.activeElement as HTMLElement).blur();
    expect(fireEvent.keyDown(dialog, { key: "Tab" })).toBe(false);
    expect(dialog).toHaveFocus();
    (document.activeElement as HTMLElement).blur();
    expect(fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true })).toBe(
      false,
    );
    expect(dialog).toHaveFocus();
  });

  it("onKeyDownが先にpreventDefaultしたTabは折り返さない", () => {
    render(
      <ModalDialog
        aria-label="x"
        onKeyDown={(e) => {
          if (e.key === "Tab") e.preventDefault();
        }}
      >
        <button>最初</button>
        <button>最後</button>
      </ModalDialog>,
    );
    const last = screen.getByRole("button", { name: "最後" });
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(last).toHaveFocus();
  });

  it("className・aria属性・onClickなどの属性をdialogへ引き渡し、tabIndexは-1で固定する", () => {
    const onClick = vi.fn();
    render(
      <ModalDialog
        className="overlay"
        aria-labelledby="t"
        aria-describedby="d"
        aria-busy="true"
        onClick={onClick}
      >
        <h2 id="t">題名</h2>
        <p id="d">説明</p>
      </ModalDialog>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("overlay");
    expect(dialog).toHaveAttribute("aria-busy", "true");
    expect(dialog).toHaveAccessibleDescription("説明");
    expect(dialog).toHaveAttribute("tabindex", "-1");
    fireEvent.click(dialog);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("refからdialog要素を参照できる", () => {
    const ref = createRef<HTMLDialogElement>();
    render(<ModalDialog aria-label="x" ref={ref} />);
    expect(ref.current).toBe(screen.getByRole("dialog"));
  });

  it("Escape以外のキーではonEscapeを呼ばない", () => {
    const onEscape = vi.fn();
    render(
      <ModalDialog aria-label="x" onEscape={onEscape}>
        <button>ボタン</button>
      </ModalDialog>,
    );
    const button = screen.getByRole("button", { name: "ボタン" });
    for (const key of ["Enter", " ", "ArrowDown", "a"]) {
      expect(fireEvent.keyDown(button, { key })).toBe(true);
    }
    expect(onEscape).not.toHaveBeenCalled();
  });

  describe("Androidの戻る操作", () => {
    it("戻る操作でonEscapeが呼ばれ処理済み(true)になる", () => {
      const onEscape = vi.fn();
      render(<ModalDialog aria-label="x" onEscape={onEscape} />);

      let handled = false;
      act(() => {
        handled = handleAndroidBack();
      });

      expect(handled).toBe(true);
      expect(onEscape).toHaveBeenCalledTimes(1);
    });

    it("onEscapeが無いダイアログでは戻る操作は処理されない(false)", () => {
      render(<ModalDialog aria-label="x" />);

      expect(handleAndroidBack()).toBe(false);
    });

    it("アンマウント後の戻る操作は処理されない(false)", () => {
      const onEscape = vi.fn();
      const { unmount } = render(
        <ModalDialog aria-label="x" onEscape={onEscape} />,
      );
      unmount();

      expect(handleAndroidBack()).toBe(false);
      expect(onEscape).not.toHaveBeenCalled();
    });

    it("再レンダーでonEscapeが差し替わっても最新のものが呼ばれる", () => {
      const first = vi.fn();
      const second = vi.fn();
      const { rerender } = render(
        <ModalDialog aria-label="x" onEscape={first} />,
      );
      rerender(<ModalDialog aria-label="x" onEscape={second} />);

      act(() => {
        handleAndroidBack();
      });

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    });

    it("ダイアログが重なっているときは後から開いた最前面だけが閉じる", () => {
      const onBackEscape = vi.fn();
      const onFrontEscape = vi.fn();
      const { rerender } = render(
        <ModalDialog aria-label="背面" onEscape={onBackEscape} />,
      );
      rerender(
        <>
          <ModalDialog aria-label="背面" onEscape={onBackEscape} />
          <ModalDialog aria-label="前面" onEscape={onFrontEscape} />
        </>,
      );

      act(() => {
        handleAndroidBack();
      });

      expect(onFrontEscape).toHaveBeenCalledTimes(1);
      expect(onBackEscape).not.toHaveBeenCalled();
    });
  });

  it("開いたままのダイアログにcloseイベントが届いてもshowModalを呼び直さない", () => {
    render(<ModalDialog aria-label="x" />);
    const dialog = screen.getByRole("dialog") as HTMLDialogElement;
    const showModal = vi.spyOn(dialog, "showModal");
    fireEvent(dialog, new Event("close"));
    expect(showModal).not.toHaveBeenCalled();
  });
});
