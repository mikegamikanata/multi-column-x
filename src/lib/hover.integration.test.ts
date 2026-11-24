import { describe, expect, it } from "vitest";
import { listStyleFiles } from "@/test-utils/scssBlocks";

// @types/node を入れていないため、型なしの動的 import で読み込む（Vitest は Node 上で動く）
const sassModule = "sass-embedded";
const sass = (await import(/* @vite-ignore */ sassModule)) as {
  compile: (path: string) => { css: string };
};

interface Rule {
  selector: string;
  guarded: boolean;
}

/** コンパイル後 CSS から :hover を含むルールを、メディアクエリ内かどうかとともに列挙する */
function hoverRules(css: string): Rule[] {
  const stack: string[] = [];
  const rules: Rule[] = [];
  let headStart = 0;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === "{") {
      const header = css.slice(headStart, i).replace(/\s+/g, " ").trim();
      if (header.includes(":hover")) {
        rules.push({
          selector: header,
          guarded: stack.some((h) =>
            /^@media\s*\(\s*hover\s*:\s*hover\s*\)$/.test(h),
          ),
        });
      }
      stack.push(header);
      headStart = i + 1;
    } else if (ch === "}") {
      stack.pop();
      headStart = i + 1;
    } else if (ch === ";") {
      headStart = i + 1;
    }
  }
  return rules;
}

describe("コンパイル後CSSのhover", () => {
  const entries = listStyleFiles().filter((f) => !/\/_[^/]*\.scss$/.test(f));
  const rules = entries.flatMap((file) =>
    hoverRules(sass.compile(file).css).map((r) => ({ ...r, file })),
  );

  it("タッチ端末ではホバーの見た目が適用されない（:hoverのルールはすべてhover: hoverのメディアクエリ内にある）", () => {
    const unguarded = rules
      .filter((r) => !r.guarded)
      .map((r) => `${r.file}: ${r.selector}`);
    expect(unguarded).toEqual([]);
  });

  it("マウス端末では従来どおりホバーの見た目が適用される（メディアクエリ内に:hoverのルールが存在する）", () => {
    expect(rules.filter((r) => r.guarded).length).toBeGreaterThan(50);
  });
});
