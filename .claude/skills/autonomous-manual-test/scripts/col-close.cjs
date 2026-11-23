// テスト用に追加したカラムを、ラベル指定で閉じる（閉じるボタン → 確認ダイアログの確定）。
// 使い方: node col-close.cjs <mcxtest-で始まるラベル>
// ガード: `mcxtest-` 接頭辞が無いラベルは拒否する（既存カラムを消さない）。
//   ラベルに一致するカラムが 1 つでなければ、確認ダイアログに本文のラベルが含まれなければ中止する。
"use strict";
const cdp = require("./cdp.cjs");
const PREFIX = "mcxtest-";
(async () => {
  const label = process.argv[2];
  if (!label || !label.startsWith(PREFIX)) {
    console.error(`拒否: 「${PREFIX}」で始まるテスト用ラベルだけ削除できる`);
    process.exit(2);
  }
  const { p } = await cdp.main();
  const r = await p.evaluate(async (label) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const hit = [
      ...document.querySelectorAll('button[aria-label="カラムを閉じる"]'),
    ].filter((b) => {
      let e = b;
      for (let i = 0; i < 4 && e; i++) {
        e = e.parentElement;
        if (e && e.textContent.includes(label) && e.textContent.length < 200)
          return true;
      }
      return false;
    });
    if (hit.length !== 1)
      return `NG: 一致する閉じるボタンが ${hit.length} 個（1 個のときだけ実行）`;
    hit[0].click();
    await sleep(700);
    const d = document.querySelector("[role=dialog],[role=alertdialog]");
    if (!d) return "NG: 確認ダイアログが出ない";
    if (!d.textContent.includes(label))
      return "NG: 確認ダイアログの本文にラベルが無いため中止";
    const ok = [...d.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === "削除する",
    );
    if (!ok) return "NG: 確定ボタン（削除する）が見つからない";
    ok.click();
    await sleep(1000);
    return "OK: 削除を確定した";
  }, label);
  console.log(r);
  process.exit(r.startsWith("NG") ? 1 : 0);
})();
