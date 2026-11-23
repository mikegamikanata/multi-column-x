// hide_grok_button.ts は IIFE のため import 時に実行され、
// window.__multiColumnXConfig はトップレベルで一度だけ読まれる。
// 設定値ごとに vi.resetModules で再 import して検証する（hide_ad.test.ts と同じ理由）。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const GROK_PATH_D = "M12.745 20.54l10.97-8.19c.539-.4 1.307-.244 1.564.38";
const STYLE_ID = "multi-column-x-hide-grok-button";

function setConfig(config: Partial<MultiColumnXConfig>): void {
  window.__multiColumnXConfig = config as MultiColumnXConfig;
}

async function importHideGrokButton(enabled: boolean): Promise<void> {
  setConfig({ hideGrokButtonEnabled: enabled });
  vi.resetModules();
  await import("./hide_grok_button");
}

function createButton(label: string, pathD: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.setAttribute("aria-label", label);
  button.setAttribute("role", "button");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathD);
  svg.appendChild(path);
  button.appendChild(svg);
  return button;
}

function addArticleWith(...buttons: HTMLElement[]): HTMLElement {
  const article = document.createElement("article");
  article.setAttribute("role", "article");
  for (const button of buttons) article.appendChild(button);
  document.body.appendChild(article);
  return article;
}

function isHidden(el: Element): boolean {
  return getComputedStyle(el).display === "none";
}

describe("inject/hide_grok_button", () => {
  beforeEach(() => {
    if (!document.head) {
      document.documentElement.insertBefore(
        document.createElement("head"),
        document.body,
      );
    }
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("設定が ON のとき日本語 UI のポスト内 Grok ボタンが非表示になる", async () => {
    const button = createButton("Grokのアクション", GROK_PATH_D);
    addArticleWith(button);

    await importHideGrokButton(true);

    expect(isHidden(button)).toBe(true);
  });

  it("設定が ON のとき英語 UI のポスト内 Grok ボタンが非表示になる", async () => {
    const button = createButton("Grok actions", GROK_PATH_D);
    addArticleWith(button);

    await importHideGrokButton(true);

    expect(isHidden(button)).toBe(true);
  });

  it("設定が ON のときその他の言語のラベルでも Grok の文字を含めば非表示になる", async () => {
    const arabic = createButton("إجراءات Grok", GROK_PATH_D);
    const japaneseSuffix = createButton("Grok操作", GROK_PATH_D);
    const lowerCase = createButton("grok", GROK_PATH_D);
    addArticleWith(arabic, japaneseSuffix, lowerCase);

    await importHideGrokButton(true);

    expect(isHidden(arabic)).toBe(true);
    expect(isHidden(japaneseSuffix)).toBe(true);
    expect(isHidden(lowerCase)).toBe(true);
  });

  it("設定が OFF のときポスト内の Grok ボタンは表示されたままになる", async () => {
    const button = createButton("Grokのアクション", GROK_PATH_D);
    addArticleWith(button);

    await importHideGrokButton(false);

    expect(document.getElementById(STYLE_ID)).toBeNull();
    expect(isHidden(button)).toBe(false);
  });

  it("ラベルに Grok を含んでもアイコンが Grok のものでないボタンは非表示にならない", async () => {
    const button = createButton("Grok", "M0 0h24v24H0z");
    addArticleWith(button);

    await importHideGrokButton(true);

    expect(isHidden(button)).toBe(false);
  });

  it("Grok アイコンでもラベルに Grok を含まないボタンは非表示にならない", async () => {
    const button = createButton("共有", GROK_PATH_D);
    addArticleWith(button);

    await importHideGrokButton(true);

    expect(isHidden(button)).toBe(false);
  });

  it("設定が ON でもポストの外にある Grok アイコンのボタンは非表示にならない", async () => {
    const drawerButton = createButton("Grok", GROK_PATH_D);
    document.body.appendChild(drawerButton);
    const inPostButton = createButton("Grokのアクション", GROK_PATH_D);
    addArticleWith(inPostButton);

    await importHideGrokButton(true);

    expect(isHidden(drawerButton)).toBe(false);
    expect(isHidden(inPostButton)).toBe(true);
  });

  it("設定が ON のとき後から読み込まれたポストの Grok ボタンも非表示になる", async () => {
    await importHideGrokButton(true);
    const button = createButton("Grokのアクション", GROK_PATH_D);

    addArticleWith(button);

    expect(isHidden(button)).toBe(true);
  });

  it("設定が ON のとき Grok ボタンのないポストには何も起きない", async () => {
    const reply = createButton("返信", "M1.751 10c0-4.42");
    const repost = createButton("リポスト", "M4.5 3.88l4.432 4.14");
    const like = createButton("いいね", "M16.697 5.5c-1.222");
    const more = createButton("もっと見る", "M3 12c0-1.1.9");
    addArticleWith(reply, repost, like, more);

    await importHideGrokButton(true);

    for (const button of [reply, repost, like, more]) {
      expect(isHidden(button)).toBe(false);
    }
  });

  it("style 要素が head から消えても自己修復される", async () => {
    await importHideGrokButton(true);
    vi.useFakeTimers();
    document.getElementById(STYLE_ID)?.remove();
    expect(document.getElementById(STYLE_ID)).toBeNull();

    await vi.advanceTimersByTimeAsync(100);

    expect(document.getElementById(STYLE_ID)).not.toBeNull();
  });

  it("head が未生成のときは生成後に style 要素が追加される", async () => {
    document.head.remove();
    await importHideGrokButton(true);
    expect(document.getElementById(STYLE_ID)).toBeNull();

    document.documentElement.insertBefore(
      document.createElement("head"),
      document.body,
    );
    await Promise.resolve();

    expect(document.head.querySelector(`#${STYLE_ID}`)).not.toBeNull();
  });
});
