// 実クリックの代わりに Tauri コマンドを invoke して、ポップアップ等のウィンドウを開く（CDP 経由）。
// usage:
//   node open.cjs <kind>... --account=<アカウントのデータ dir 名> [--id=<accountId>] [--url=<URL>]
//     kind: media    カラム WebView から open_popup_window（メディア等のポップアップ）
//           link     メイン UI から open_link_popup_window（リンクポップアップ）
//           compose  メイン UI から open_compose_window（コンポーズ）
//   --account  %APPDATA%\<id>\accounts\ 配下のディレクトリ名（node cdp.cjs ports で一覧できる。例: account-xxxxxxxx-…）
//   --id       アカウント ID（link / compose で必要。settings.json のアカウント定義の id）
//   --url      開く URL（media / link。既定 https://x.com/explore）
// 例: node open.cjs media link --account=account-AAAA --id=BBBB
// 実クリックで開く手順の代替になる。その場合は結果セルに「代替: invoke で開いた」と明記すること。
"use strict";
const path = require("path");
const cdp = require("./cdp.cjs");

const args = process.argv.slice(2);
const opt = (name) =>
  (args.find((a) => a.startsWith(`--${name}=`)) || "").slice(name.length + 3);
const kinds = args.filter((a) => !a.startsWith("--"));
const account = opt("account");
const accountId = opt("id");
const url = opt("url") || "https://x.com/explore";

const invoke = (cmd, a) =>
  `(window.__TAURI__.core.invoke)(${JSON.stringify(cmd)}, ${JSON.stringify(a)}).then(()=>"ok",e=>"ERR "+e)`;

(async () => {
  if (kinds.length === 0 || !account) {
    console.log(
      "usage: open.cjs <media|link|compose>... --account=<dir名> [--id=<accountId>] [--url=<URL>]",
    );
    process.exit(2);
  }
  for (const kind of kinds) {
    if (kind === "media") {
      const { pages } = await cdp.account(account);
      let col;
      for (const p of pages) {
        const l = await cdp.labelOf(p);
        if (l && l.startsWith("column-")) {
          col = p;
          break;
        }
      }
      if (!col) throw new Error("column- ラベルのページが見つかりません");
      console.log(
        kind,
        await col.evaluate(invoke("open_popup_window", { url })),
      );
    } else if (kind === "link" || kind === "compose") {
      if (!accountId)
        throw new Error(`${kind} には --id=<accountId> が必要です`);
      const { p } = await cdp.main();
      const r =
        kind === "link"
          ? invoke("open_link_popup_window", { accountId, url })
          : invoke("open_compose_window", {
              accountId,
              dataDirectory: path.join(cdp.A, "accounts", account),
            });
      console.log(kind, await p.evaluate(r));
    } else {
      throw new Error(`不明な kind: ${kind}`);
    }
  }
  process.exit(0); // 接続を残さない（アプリは閉じない）
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
