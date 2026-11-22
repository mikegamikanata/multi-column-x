// CDP 接続ヘルパー（Windows / WebView2）。
// アプリを win-launch.ps1 で起動すると、WebView2 のデータディレクトリごとに
//   メイン UI : %LOCALAPPDATA%\<id>\EBWebView\DevToolsActivePort
//   各アカウント: %APPDATA%\<id>\accounts\<accountId>\EBWebView\DevToolsActivePort
//   外部サイトカラム: %APPDATA%\<id>\external_columns\column-<id>\EBWebView\DevToolsActivePort
// が書かれる（1 行目がポート）。メイン UI のページ URL は http://tauri.localhost/ 、
// カラム / ポップアップ / コンポーズはアカウントのポートに属する。
//
// playwright-core の解決: リポジトリの node_modules（devDependency の playwright が依存）を使う。
//   環境変数 MCX_REPO にリポジトリルートを入れるか、リポジトリルートを cwd にして実行する。
//   見つからない場合は、リポジトリ外の一時ディレクトリで `npm i playwright-core` し、
//   MCX_REPO にそのディレクトリを指定する（プロジェクトの依存は増やさない）。
//
// ライブラリとして:  const cdp = require('<このファイル>');  const { b, p } = await cdp.main();
// CLI として:
//   node cdp.cjs ports                              ポート一覧
//   node cdp.cjs pages                              全ページ（アカウント / label / url / title）
//   node cdp.cjs eval <main|accountId|all> "<式>" [--label=部分一致]   ページで式を評価
"use strict";
const fs = require("fs");
const path = require("path");
const repo = process.env.MCX_REPO || process.cwd();
const { chromium } = require(
  require.resolve("playwright-core", { paths: [repo, __dirname] }),
);

const ID = process.env.MCX_IDENTIFIER || "com.natsuyasai.multicolumnx";
const A = path.join(process.env.APPDATA || "", ID); // settings.json・accounts/
const L = path.join(process.env.LOCALAPPDATA || "", ID); // メイン UI の EBWebView

function readPort(file) {
  try {
    return fs.readFileSync(file, "utf8").split(/\r?\n/)[0] || null;
  } catch {
    return null;
  }
}

/** { main: port, <accountId>: port, ... } */
function ports() {
  const o = { main: readPort(path.join(L, "EBWebView", "DevToolsActivePort")) };
  const dir = path.join(A, "accounts");
  if (fs.existsSync(dir)) {
    for (const d of fs.readdirSync(dir))
      o[d] = readPort(path.join(dir, d, "EBWebView", "DevToolsActivePort"));
  }
  // 外部サイトカラムは external_columns\column-<id>\EBWebView に独立データを持つ
  const ext = path.join(A, "external_columns");
  if (fs.existsSync(ext)) {
    for (const d of fs.readdirSync(ext))
      o[d] = readPort(path.join(ext, d, "EBWebView", "DevToolsActivePort"));
  }
  return o;
}

async function connect(key) {
  const port = ports()[key];
  if (!port)
    throw new Error(
      `ポートが見つかりません: ${key}（アプリは win-launch.ps1 で起動したか）`,
    );
  const b = await chromium.connectOverCDP("http://127.0.0.1:" + port);
  return { b, pages: b.contexts().flatMap((c) => c.pages()) };
}

/** メイン UI のページ（http://tauri.localhost/）。{ b, p } */
async function main() {
  const { b, pages } = await connect("main");
  const p = pages.find((x) => x.url().includes("tauri.localhost"));
  if (!p) throw new Error("メイン UI のページが見つかりません");
  return { b, p };
}

/** アカウントに属する全ページ（カラム / ポップアップ / コンポーズ）。{ b, pages } */
const account = connect;

/** Tauri の WebView ラベル（column-… / popup-… / compose-… など）。取れなければ null */
const labelOf = (p) =>
  p
    .evaluate(() => window.__TAURI_INTERNALS__?.metadata?.currentWebview?.label)
    .catch(() => null);

/** 全アカウントのページから、ラベルが部分一致するものを探す。{ b, p, label } か null */
async function findByLabel(part) {
  for (const k of Object.keys(ports()).filter((k) => k !== "main")) {
    const r = await connect(k).catch(() => ({ pages: [] }));
    for (const p of r.pages) {
      const label = await labelOf(p);
      if (label && label.includes(part)) return { b: r.b, p, label };
    }
  }
  return null;
}

const settings = () =>
  JSON.parse(fs.readFileSync(path.join(A, "settings.json"), "utf8"));

module.exports = {
  chromium,
  ports,
  connect,
  main,
  account,
  labelOf,
  findByLabel,
  settings,
  A,
  L,
};

if (require.main === module) {
  (async () => {
    const [cmd, target, expr] = process.argv.slice(2);
    if (cmd === "ports") console.log(ports());
    else if (cmd === "pages") {
      for (const k of Object.keys(ports())) {
        const r = await connect(k).catch((e) => ({
          pages: [],
          err: e.message,
        }));
        for (const p of r.pages)
          console.log(
            k.slice(0, 12),
            (await labelOf(p)) ?? "-",
            p.url().slice(0, 80),
            JSON.stringify(await p.title()),
          );
        if (r.err) console.log(k.slice(0, 12), "ERR", r.err);
      }
    } else if (cmd === "eval") {
      const label = (
        process.argv.find((a) => a.startsWith("--label=")) || ""
      ).slice(8);
      const keys = target === "all" ? Object.keys(ports()) : [target];
      for (const k of keys) {
        const r = await connect(k);
        for (const p of r.pages) {
          const l = await labelOf(p);
          if (label && !(l || "").includes(label)) continue;
          console.log(
            k.slice(0, 12),
            l ?? p.url().slice(0, 60),
            "=>",
            JSON.stringify(
              await p.evaluate(expr).catch((e) => "ERR " + e.message),
            ),
          );
        }
      }
    } else
      console.log(
        'usage: cdp.cjs ports | pages | eval <main|accountId|all> "<式>" [--label=部分一致]',
      );
    process.exit(0); // connectOverCDP の接続を残して居座らない（アプリは閉じない）
  })();
}
