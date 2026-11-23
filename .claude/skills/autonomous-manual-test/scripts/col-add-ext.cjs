// 外部サイトカラムをテスト用に追加する（メイン UI を CDP で操作）。
// 使い方: node col-add-ext.cjs <https://…のURL> <mcxtest-で始まるラベル>
// - ラベルは必ず `mcxtest-` 接頭辞（既存カラムのラベルと衝突させない・後で削除対象を限定するため）
// - React 制御の input / select は native setter + input / change イベントで値を入れる
"use strict";
const cdp = require("./cdp.cjs");
const PREFIX = "mcxtest-";
(async () => {
  const [url, label] = process.argv.slice(2);
  if (!url || !/^https:\/\//.test(url) || !label) {
    console.error("usage: node col-add-ext.cjs <https://URL> <mcxtest-ラベル>");
    process.exit(2);
  }
  if (!label.startsWith(PREFIX)) {
    console.error(
      `拒否: ラベルは「${PREFIX}」で始めること（テスト用カラムの識別用）`,
    );
    process.exit(2);
  }
  const { p } = await cdp.main();
  const r = await p.evaluate(
    async ([url, label]) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const setV = (el, v, proto) => {
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
        el.dispatchEvent(
          new Event(el.tagName === "SELECT" ? "change" : "input", {
            bubbles: true,
          }),
        );
      };
      if (!document.querySelector("[role=dialog]")) {
        const add = document.querySelector(
          'button[aria-label^="カラムを追加"]',
        );
        if (!add) return "NG: カラム追加ボタンが見つからない";
        add.click();
        await sleep(600);
      }
      const d = document.querySelector("[role=dialog]");
      if (!d) return "NG: 追加ダイアログが開かない";
      setV(
        d.querySelector("select[id$=page-type]"),
        "external",
        HTMLSelectElement.prototype,
      );
      await sleep(400);
      const u = [...d.querySelectorAll("input")].find((i) =>
        i.placeholder.startsWith("https"),
      );
      if (!u) return "NG: URL 入力欄が見つからない";
      setV(u, url, HTMLInputElement.prototype);
      const l = d.querySelector("input[id$=column-label]");
      if (!l) return "NG: ラベル入力欄が見つからない";
      setV(l, label, HTMLInputElement.prototype);
      await sleep(300);
      d.querySelector("button[type=submit]").click();
      await sleep(1500);
      return document.querySelector("[role=dialog]")
        ? "ダイアログが残っている（入力エラーの可能性。画面を確認）"
        : "OK: 追加を送信した";
    },
    [url, label],
  );
  console.log(r);
  process.exit(r.startsWith("NG") ? 1 : 0);
})();
