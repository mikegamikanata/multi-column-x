/// <reference types="vitest/globals" />
import { beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import i18n from "@/i18n";

// 既存テストは日本語文言を前提にしているため、全テストを日本語に固定する
// （jsdom の navigator.language は "en-US" のため、言語設定 "auto" も日本語に解決させる）
beforeEach(async () => {
  vi.spyOn(navigator, "language", "get").mockReturnValue("ja-JP");
  await i18n.changeLanguage("ja");
});

// jsdom には scrollIntoView が無いため、呼び出しても落ちないようにする
Element.prototype.scrollIntoView ??= vi.fn();

// Tauri APIをモック
Object.defineProperty(window, "__TAURI__", {
  value: {
    invoke: vi.fn(),
    event: {
      listen: vi.fn(),
      emit: vi.fn(),
    },
  },
  writable: true,
});

// jsdom は HTMLDialogElement.showModal / close を実装していないため、open 属性の付け外しだけを再現する。
// Tab の巡回・inert・top layer は jsdom では検証できない（Storybook の play function で検証する）。
if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal ??= function showModal(
    this: HTMLDialogElement,
  ) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function close(
    this: HTMLDialogElement,
  ) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}
