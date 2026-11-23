// WebKit リモートインスペクタ接続ヘルパー（Linux / WebKitGTK）。Windows の cdp.cjs に相当する。
// アプリを linux-launch.sh（環境変数 WEBKIT_INSPECTOR_HTTP_SERVER=127.0.0.1:<port>）で起動すると、
//   http://127.0.0.1:<port>/        … 全 WebView（メイン UI・各カラム・ServiceWorker）の HTML 一覧（/json は無い）
//   ws://127.0.0.1:<port>/socket/<conn>/<target>/WebPage … 各ターゲットの WebSocket
// が使える。メイン UI は URL tauri://localhost、カラムは https://x.com/…（ターゲットごとに別。タイトルは空のことが多い）。
// 依存なし（Node 22+ のグローバル WebSocket / fetch を使う）。ポートは環境変数 MCX_WK_PORT（既定 9340）。
//
// プロトコルの要点:
//   - 接続直後に Target.targetCreated が届く（type==='page' の targetId を使う。frame 型も届く）。ページ ID は再読み込みで変わる
//   - トップレベルに Runtime.evaluate を送ると 'Runtime' domain was not found になる。
//     Target.sendMessageToTarget（params: targetId, message=内側コマンドの JSON 文字列）で包み、
//     応答は Target.dispatchMessageFromTarget の params.message（JSON 文字列）で届く
//   - Runtime.evaluate の awaitPromise は効かない（Promise は {} で返る）。evaluate() は Promise を検出して
//     Runtime.awaitPromise（objectId 指定）で結果を待つ
//
// ライブラリとして:  const wk = require('<このファイル>');  const t = await wk.connect('main');
//   const v = await t.evaluate('document.title');  await t.snapshot('/tmp/a.png');  t.close();
// CLI として:
//   node wk.cjs targets                                  ターゲット一覧（番号・種別・タイトル・URL・ws パス）
//   node wk.cjs eval <main|all|番号|URL 部分一致> "<式>"    式を評価（Promise は待つ）。all は全ページ、URL 部分一致は一致した全ターゲット
//   node wk.cjs shot <対象> <out.png> [x y w h]           Page.snapshotRect で WebView 単位のスクリーンショット（既定は viewport 全体）
// <対象> の main は URL が tauri://localhost のメイン UI、番号は targets の左端の番号。
"use strict";
const fs = require("fs");

const PORT = process.env.MCX_WK_PORT || "9340";
const BASE = `127.0.0.1:${PORT}`;
const TIMEOUT = Number(process.env.MCX_WK_TIMEOUT_MS || 15000);

/** インスペクタの HTML 一覧を解析する。[{index, kind, title, url, ws}] */
async function targets() {
  const res = await fetch(`http://${BASE}/`, {
    signal: AbortSignal.timeout(5000),
  });
  const html = await res.text();
  const out = [];
  for (const m of html.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)) {
    const row = m[1];
    const title = (row.match(/class="targetname">([^<]*)</) || [])[1] || "";
    const url = (row.match(/class="targeturl">([^<]*)</) || [])[1] || "";
    const sock = row.match(/\/socket\/(\d+)\/(\d+)\/(\w+)/);
    if (!sock) continue;
    out.push({
      index: out.length,
      kind: sock[3], // WebPage / ServiceWorker
      title: decodeEntities(title),
      url: decodeEntities(url),
      ws: sock[0],
    });
  }
  return out;
}

const decodeEntities = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

/** セレクタ（main / all / 番号 / URL 部分一致）からターゲット配列を解決する */
async function resolve(sel) {
  const all = await targets();
  const pages = all.filter((t) => t.kind === "WebPage");
  let r;
  if (sel === "main") r = pages.filter((t) => t.url.startsWith("tauri://"));
  else if (sel === "all") r = pages;
  else if (/^\d+$/.test(sel)) r = all.filter((t) => t.index === Number(sel));
  else r = pages.filter((t) => t.url.includes(sel));
  if (r.length === 0) throw new Error(`ターゲットが見つかりません: ${sel}`);
  return r;
}

/** ターゲットへ接続する。target は targets() の要素か ws パス文字列。{evaluate, snapshot, close} */
function connect(target) {
  const wsPath = typeof target === "string" ? target : target.ws;
  if (typeof target === "string" && !target.startsWith("/socket/"))
    return resolve(target).then((r) => connect(r[0]));
  return new Promise((resolveConn, reject) => {
    const ws = new WebSocket(`ws://${BASE}${wsPath}`);
    let nextId = 0;
    let targetId = null;
    const pending = new Map(); // 内側コマンド id -> {resolve, reject}
    const fail = (e) => {
      for (const p of pending.values()) p.reject(e);
      pending.clear();
    };
    const timer = setTimeout(() => {
      reject(new Error("targetCreated を待っている間にタイムアウト"));
      try {
        ws.close();
      } catch {}
    }, TIMEOUT);

    const call = (method, params = {}) =>
      new Promise((res, rej) => {
        const id = ++nextId;
        const t = setTimeout(() => {
          pending.delete(id);
          rej(new Error(`タイムアウト: ${method}`));
        }, TIMEOUT);
        pending.set(id, {
          resolve: (v) => (clearTimeout(t), res(v)),
          reject: (e) => (clearTimeout(t), rej(e)),
        });
        ws.send(
          JSON.stringify({
            id,
            method: "Target.sendMessageToTarget",
            params: {
              targetId,
              message: JSON.stringify({ id, method, params }),
            },
          }),
        );
      });

    async function evaluate(expression) {
      const r = await call("Runtime.evaluate", {
        expression,
        returnByValue: false,
      });
      if (r.wasThrown) throw new Error(r.result?.description || "評価エラー");
      let o = r.result;
      if (o.className === "Promise" || o.subtype === "promise") {
        const a = await call("Runtime.awaitPromise", {
          promiseObjectId: o.objectId,
          returnByValue: true,
        });
        if (a.wasThrown) throw new Error(a.result?.description || "reject");
        return a.result.value;
      }
      if (o.objectId && !("value" in o)) {
        const c = await call("Runtime.callFunctionOn", {
          objectId: o.objectId,
          functionDeclaration: "function(){return this}",
          returnByValue: true,
        });
        return c.result?.value;
      }
      return o.value; // プリミティブ・undefined
    }

    /** Page.snapshotRect。out を渡すとその PNG に保存。rect 省略時は viewport 全体 */
    async function snapshot(out, rect) {
      rect =
        rect ||
        (await evaluate("({x:0,y:0,width:innerWidth,height:innerHeight})"));
      const r = await call("Page.snapshotRect", {
        ...rect,
        coordinateSystem: "Viewport",
      });
      const m = /^data:image\/png;base64,(.*)$/.exec(r.dataURL || "");
      if (!m) throw new Error("snapshotRect が PNG を返さなかった");
      const buf = Buffer.from(m[1], "base64");
      if (out) fs.writeFileSync(out, buf);
      return buf;
    }

    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.method === "Target.targetCreated") {
        if (targetId === null && d.params.targetInfo.type === "page") {
          targetId = d.params.targetInfo.targetId;
          clearTimeout(timer);
          resolveConn({
            evaluate,
            snapshot,
            call,
            close: () => {
              try {
                ws.close();
              } catch {}
            },
          });
        }
      } else if (d.method === "Target.dispatchMessageFromTarget") {
        const inner = JSON.parse(d.params.message);
        const p = pending.get(inner.id);
        if (!p) return;
        pending.delete(inner.id);
        if (inner.error) p.reject(new Error(inner.error.message));
        else p.resolve(inner.result);
      }
    };
    ws.onerror = () => {
      clearTimeout(timer);
      const err = new Error(
        `WebSocket エラー: ${wsPath}（接続失敗、またはアプリの終了・再起動・WebView の再生成で切れた）`,
      );
      reject(err);
      fail(err);
    };
    ws.onclose = () => fail(new Error("WebSocket が閉じた"));
  });
}

module.exports = { targets, resolve, connect, PORT };

if (require.main === module) {
  (async () => {
    const [cmd, sel, a, ...rest] = process.argv.slice(2);
    let code = 0;
    try {
      if (cmd === "targets") {
        for (const t of await targets())
          console.log(
            `${t.index}\t${t.kind}\t${JSON.stringify(t.title)}\t${t.url}\t${t.ws}`,
          );
      } else if (cmd === "eval" && sel && a !== undefined) {
        for (const t of await resolve(sel)) {
          const c = await connect(t);
          try {
            const v = await c.evaluate(a).catch((e) => "ERR " + e.message);
            console.log(
              `#${t.index} ${t.url.slice(0, 60)} => ${JSON.stringify(v)}`,
            );
          } finally {
            c.close();
          }
        }
      } else if (cmd === "shot" && sel && a) {
        const rect =
          rest.length === 4
            ? {
                x: Number(rest[0]),
                y: Number(rest[1]),
                width: Number(rest[2]),
                height: Number(rest[3]),
              }
            : null;
        const ts = await resolve(sel);
        for (const t of ts) {
          const out =
            ts.length > 1 ? a.replace(/\.png$/, `-${t.index}.png`) : a;
          const c = await connect(t);
          try {
            const buf = await c.snapshot(out, rect);
            console.log(
              `#${t.index} ${t.url.slice(0, 60)} -> ${out} (${buf.length} bytes)`,
            );
          } catch (e) {
            console.log(
              `#${t.index} ${t.url.slice(0, 60)} => ERR ${e.message}`,
            );
            code = 1;
          } finally {
            c.close();
          }
        }
      } else {
        console.log(
          'usage: wk.cjs targets | eval <main|all|番号|URL 部分一致> "<式>" | shot <対象> <out.png> [x y w h]',
        );
        code = 2;
      }
    } catch (e) {
      console.error("ERR", e.message);
      code = 1;
    }
    process.exit(code); // WebSocket を残して居座らない（アプリは閉じない）
  })();
}
