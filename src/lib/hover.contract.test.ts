import { describe, expect, it } from "vitest";
import {
  listStyleFiles,
  readScss,
  stripScssComments,
} from "@/test-utils/scssBlocks";

const HOVER_GUARD =
  /^@media\s*\(\s*hover\s*:\s*hover\s*\)$|^@include\s+m\.hover-capable$/;

/** :hover を含むルールのうち、ホバー可能端末限定のブロックの内側にないものを列挙する */
export function findUnguardedHover(source: string): string[] {
  const text = stripScssComments(source);
  const stack: string[] = [];
  const violations: string[] = [];
  let headStart = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{" && text[i - 1] !== "#") {
      const header = text.slice(headStart, i).replace(/\s+/g, " ").trim();
      if (header.includes(":hover") && !stack.some((h) => HOVER_GUARD.test(h)))
        violations.push(header);
      stack.push(header);
      headStart = i + 1;
    } else if (ch === "}") {
      stack.pop();
      headStart = i + 1;
    } else if (ch === ";") {
      headStart = i + 1;
    }
  }
  return violations;
}

describe("全スタイルのhoverの契約", () => {
  const files = listStyleFiles();

  it("スタイルファイルが列挙できている", () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files).toContain("src/App.css");
  });

  it("全SCSSとCSSの:hoverはホバーできる端末向けのメディアクエリの内側にだけ存在する", () => {
    const violations = files.flatMap((file) =>
      findUnguardedHover(readScss(file)).map((sel) => `${file}: ${sel}`),
    );
    expect(violations).toEqual([]);
  });

  it("メディアクエリの外にある:hoverを検出できる", () => {
    expect(findUnguardedHover(".a { &:hover { color: red; } }")).toEqual([
      "&:hover",
    ]);
    expect(
      findUnguardedHover(
        "@include m.hover-capable { .a { &:hover { color: red; } } }",
      ),
    ).toEqual([]);
  });
});
