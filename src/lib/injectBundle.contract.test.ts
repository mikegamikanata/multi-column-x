// inject スクリプトのバンドル形状の契約テスト。
// `vite.inject.config.ts` が `src-tauri/src/inject/*.js` に出力する成果物は、Rust 側が
// `include_str!` で読み込み、WebView へ「クラシックスクリプト」として注入する。
// そのためトップレベルの import / export や共有チャンクへの依存が混入すると実行時に壊れる。
// vite などビルドツールの更新で出力形状が変わっていないことを、ビルド成果物を直接読んで検査する。
// 前提: `npm run build:inject` を先に実行しておくこと（CI の frontend ジョブは npm test の前に実行している）。
import { describe, expect, it } from "vitest";

// @types/node を入れていないため、型なしの動的 import で fs を読み込む（Vitest は Node 上で動く）
const nodeFs = "node:fs";
const { existsSync, readFileSync } = (await import(
  /* @vite-ignore */ nodeFs
)) as {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string, encoding: "utf-8") => string;
};

const INJECT_DIR = "src-tauri/src/inject";
const REACT_ENTRY = "header_customizer";

/** vite.inject.config.ts の `plainEntries` 配列からエントリ名を取り出す */
function readPlainEntries(): string[] {
  const config = readFileSync("vite.inject.config.ts", "utf-8");
  const block = config.match(/const plainEntries = \[([\s\S]*?)\];/);
  expect(block, "plainEntries の定義が見つからない").not.toBeNull();
  const names = [...(block?.[1] ?? "").matchAll(/"([a-z0-9_]+)"/g)].map(
    (m) => m[1],
  );
  expect(names.length).toBeGreaterThan(0);
  return names;
}

const plainEntries = readPlainEntries();
const allEntries = [...plainEntries, REACT_ENTRY];

function bundlePath(name: string): string {
  return `${INJECT_DIR}/${name}.js`;
}

function readBundle(name: string): string {
  return readFileSync(bundlePath(name), "utf-8");
}

describe("inject バンドルの形状", () => {
  it("すべてのエントリのバンドルが生成されている", () => {
    const missing = allEntries.filter((name) => !existsSync(bundlePath(name)));

    expect(
      missing,
      `未生成のバンドルがある。先に \`npm run build:inject\` を実行すること: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("通常エントリは単一ファイルで自己完結しトップレベルの import と export を持たない", () => {
    for (const name of plainEntries) {
      const code = readBundle(name);

      expect(code.trim().length, `${name}.js が空`).toBeGreaterThan(0);
      expect(code, `${name}.js にトップレベルの import がある`).not.toMatch(
        /^import\b/m,
      );
      expect(code, `${name}.js にトップレベルの export がある`).not.toMatch(
        /^export\b/m,
      );
      expect(code, `${name}.js が import.meta を参照している`).not.toContain(
        "import.meta",
      );
    }
  });

  it("header_customizer は React を含む単一ファイルの即時実行関数として出力される", () => {
    const code = readBundle(REACT_ENTRY).trim();

    expect(code.startsWith("(function")).toBe(true);
    expect(code.endsWith("})();")).toBe(true);
    expect(code).not.toMatch(/^import\b/m);
    expect(code).not.toMatch(/^export\b/m);
    expect(code).not.toContain("import.meta");
    // React 本体が同梱されている（外部の共有チャンクに依存しない）
    expect(code).toContain("react.transitional.element");
  });

  it("header_customizer の document.head への追加は head が無い時点でも安全な形に置換される", () => {
    const code = readBundle(REACT_ENTRY);
    const safeWrapper =
      "(function(el){if(document.head){document.head.appendChild(el);}else{document.addEventListener('DOMContentLoaded',function(){document.head.appendChild(el);});}})(";

    expect(code).toContain(safeWrapper);
    // 置換済みのラッパーを取り除くと、素の `document.head.appendChild(...)` は残らない
    const withoutWrapper = code.split(safeWrapper).join("");
    // 失敗時にバンドル全体が出力されないよう、真偽値で検査する
    expect(/document\.head\.appendChild\(/.test(withoutWrapper)).toBe(false);
  });
});
