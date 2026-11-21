import { render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRestoreFocus } from "./useRestoreFocus";

function Dialog() {
  useRestoreFocus();
  return createElement("div", null, "ダイアログ");
}

describe("useRestoreFocus", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("アンマウント時に開く前にフォーカスしていたボタンへフォーカスを戻す", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = render(createElement(Dialog));
    opener.blur();
    expect(document.activeElement).not.toBe(opener);

    unmount();

    expect(document.activeElement).toBe(opener);
  });

  it("開く前の要素がDOMから消えていても例外を出さず、フォーカスも試みない", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const focusSpy = vi.spyOn(opener, "focus");

    const { unmount } = render(createElement(Dialog));
    opener.remove();

    expect(() => unmount()).not.toThrow();
    expect(focusSpy).not.toHaveBeenCalled();
  });

  it("開く前にフォーカスがbodyにあったときは何もしない", () => {
    const bodyFocusSpy = vi.spyOn(document.body, "focus");
    expect(document.activeElement).toBe(document.body);

    const { unmount } = render(createElement(Dialog));
    unmount();

    expect(bodyFocusSpy).not.toHaveBeenCalled();
  });
});
