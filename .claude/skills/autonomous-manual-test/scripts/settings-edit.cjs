// アプリ終了中に settings.json を編集する補助。
// 使い方:
//   node settings-edit.cjs get <キーパス>
//   node settings-edit.cjs set <キーパス> '<JSON値>'
//   node settings-edit.cjs push <キーパス> '<JSON値>'      配列に追加
//   node settings-edit.cjs remove <キーパス> '<JSON値>'    配列から一致する要素を削除
// キーパスは `.` 区切り（例: pendingDataDirectoryDeletions。ネストしていれば a.b.c）。
// 先頭キーが直下に無ければ、入れ子の中から最初に見つかったオブジェクトを使う。
// アプリ（multicolumnx.exe）が起動中なら拒否する（終了時に上書きされるため）。
// パスを値に含めるときは、シェルの heredoc でバックスラッシュが消えるので
// `node -e` 等で path.join(process.env.APPDATA, …) から JSON.stringify して渡すこと。
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ID = process.env.MCX_IDENTIFIER || "com.natsuyasai.multicolumnx";
const file = path.join(process.env.APPDATA || "", ID, "settings.json");

const [op, keyPath, raw] = process.argv.slice(2);
if (!["get", "set", "push", "remove"].includes(op) || !keyPath) {
  console.error(
    "usage: settings-edit.cjs get|set|push|remove <キーパス> ['<JSON値>']",
  );
  process.exit(2);
}
if (op !== "get") {
  const out = execFileSync(
    "tasklist",
    ["/FI", "IMAGENAME eq multicolumnx.exe", "/NH"],
    {
      encoding: "utf8",
    },
  );
  if (/multicolumnx\.exe/i.test(out)) {
    console.error("拒否: multicolumnx.exe が起動中。正常終了してから編集する");
    process.exit(1);
  }
}
const j = JSON.parse(fs.readFileSync(file, "utf8"));
const keys = keyPath.split(".");
function findHolder(o, k) {
  if (o && typeof o === "object") {
    if (k in o) return o;
    for (const c of Object.values(o)) {
      const r = findHolder(c, k);
      if (r) return r;
    }
  }
  return null;
}
let holder = findHolder(j, keys[0]);
if (!holder) {
  if (op === "get") {
    console.log("undefined");
    process.exit(0);
  }
  holder = j; // 無ければ直下に作る
}
let parent = holder;
for (const k of keys.slice(0, -1)) {
  if (op !== "get" && !(parent[k] && typeof parent[k] === "object"))
    parent[k] = {};
  parent = parent[k];
  if (parent === undefined) break;
}
const last = keys[keys.length - 1];
const val = raw === undefined ? undefined : JSON.parse(raw);
if (op === "get") {
  console.log(JSON.stringify(parent?.[last], null, 2));
  process.exit(0);
}
if (op === "set") parent[last] = val;
else {
  if (!Array.isArray(parent[last])) parent[last] = [];
  if (op === "push") parent[last].push(val);
  else
    parent[last] = parent[last].filter(
      (x) => JSON.stringify(x) !== JSON.stringify(val),
    );
}
fs.writeFileSync(file, JSON.stringify(j, null, 2));
console.log(JSON.stringify(parent[last], null, 2));
