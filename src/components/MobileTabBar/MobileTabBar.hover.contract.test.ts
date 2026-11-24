import { describe, expect, it } from "vitest";
import { readScss, stripScssComments } from "@/test-utils/scssBlocks";

const SCSS_PATH = "src/components/MobileTabBar/MobileTabBar.module.scss";
const HOVER_MEDIA = /@media\s*\(\s*hover\s*:\s*hover\s*\)\s*\{/g;

/** `open` 位置の `{` に対応する `}` の位置を返す */
function closingBrace(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return source.length;
}

/** `.tab { ... }` ブロックの中身を返す */
function tabBlockBody(source: string): string {
  const header = /^\.tab\s*\{/m.exec(source);
  if (!header) throw new Error(".tab ブロックが見つからない");
  const open = header.index + header[0].length - 1;
  return source.slice(open + 1, closingBrace(source, open));
}

/** 本文を「@media (hover: hover) の中身の一覧」と「それを取り除いた残り」に分ける */
function splitHoverMedia(body: string): { inside: string[]; outside: string } {
  const inside: string[] = [];
  let outside = "";
  let cursor = 0;
  for (const match of body.matchAll(HOVER_MEDIA)) {
    const open = match.index + match[0].length - 1;
    const close = closingBrace(body, open);
    outside += body.slice(cursor, match.index);
    inside.push(body.slice(open + 1, close));
    cursor = close + 1;
  }
  outside += body.slice(cursor);
  return { inside, outside };
}

describe("MobileTabBarのタブのhoverの契約", () => {
  const body = tabBlockBody(stripScssComments(readScss(SCSS_PATH)));
  const { inside, outside } = splitHoverMedia(body);

  it("タブのhoverはホバーできる端末にだけ適用される", () => {
    expect(inside.some((content) => /&:hover\s*\{/.test(content))).toBe(true);
  });

  it("タブのhoverがタッチ端末で残らないようメディアクエリの外には書かれていない", () => {
    expect(outside).not.toMatch(/&:hover/);
  });

  it("タブのactiveとfocus-visibleはメディアクエリの外にあり、タッチ端末でも押下状態が見える", () => {
    expect(outside).toMatch(/&:active\s*\{/);
    expect(outside).toMatch(/&:focus-visible\s*\{/);
  });
});
