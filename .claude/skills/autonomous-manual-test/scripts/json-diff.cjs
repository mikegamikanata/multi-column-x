// 2 つの JSON ファイルを意味比較する（キー順・数値表記の違いは無視）。
// usage: node json-diff.cjs <a.json> <b.json> [--ignore=windowBounds,…]
// 差分があればキーのパス（例: appSettings.theme）を表示し、終了コード 1 を返す。
// --ignore のキー名は、どの階層にあっても比較対象から外す。
"use strict";
const fs = require("fs");

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith("--"));
const ignore = new Set(
  (args.find((a) => a.startsWith("--ignore=")) || "")
    .slice(9)
    .split(",")
    .filter(Boolean),
);

const load = (f) =>
  fs.existsSync(f)
    ? JSON.parse(fs.readFileSync(f, "utf8").replace(/^\uFEFF/, ""))
    : undefined;

function diff(a, b, path, out) {
  if (a === b) return;
  const isObj = (v) => v !== null && typeof v === "object";
  if (!isObj(a) || !isObj(b) || Array.isArray(a) !== Array.isArray(b)) {
    out.push(
      `${path || "(root)"}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`,
    );
    return;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of [...keys].sort()) {
    if (ignore.has(k)) continue;
    const p = path ? `${path}.${k}` : k;
    if (!(k in a)) out.push(`${p}: (なし) -> ${JSON.stringify(b[k])}`);
    else if (!(k in b)) out.push(`${p}: ${JSON.stringify(a[k])} -> (なし)`);
    else diff(a[k], b[k], p, out);
  }
}

const out = [];
diff(load(files[0]), load(files[1]), "", out);
if (out.length === 0) {
  console.log("同一（意味比較）");
} else {
  console.log(`差分あり（${out.length} 件）`);
  for (const l of out) console.log("  " + l.slice(0, 300));
  process.exit(1);
}
