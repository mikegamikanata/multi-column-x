import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "./constants.mjs";
import { buildTestOverlay } from "./overlay.mjs";

const baseConf = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, "src-tauri", "tauri.conf.json"), "utf8"),
);
const ORIGINS = [
  "http://localhost:8787",
  "http://127.0.0.1:8787",
  "http://10.0.2.2:8787",
];
const overlay = buildTestOverlay({
  baseConf,
  pubkey: "  TEST-PUBKEY\n",
  version: "9.9.9",
  origins: ORIGINS,
});

/** CSP をディレクティブ名 → 値の配列に分解する。 */
function parseCsp(csp: string): Map<string, string[]> {
  return new Map(
    csp
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const [name, ...values] = d.split(/\s+/);
        return [name, values] as [string, string[]];
      }),
  );
}

describe("試験用の重ね設定は取得先をローカル配信サーバーに差し替える", () => {
  it("更新の取得先はローカル配信サーバーの latest.json だけになる", () => {
    expect(overlay.plugins.updater.endpoints).toEqual([
      "http://localhost:8787/latest.json",
    ]);
  });

  it("公開鍵は引数の試験用の鍵（前後の空白除去）になる", () => {
    expect(overlay.plugins.updater.pubkey).toBe("TEST-PUBKEY");
    expect(overlay.plugins.updater.pubkey).not.toBe(
      baseConf.plugins.updater.pubkey,
    );
  });

  it("平文通信の許可が有効になる", () => {
    expect(overlay.plugins.updater.dangerousInsecureTransportProtocol).toBe(
      true,
    );
  });

  it("バージョンは引数の値になる", () => {
    expect(overlay.version).toBe("9.9.9");
  });

  it("connect-src に 3 オリジンが追加され既存の許可も残る", () => {
    const base = parseCsp(baseConf.app.security.csp).get("connect-src")!;
    const connect = parseCsp(overlay.app.security.csp).get("connect-src")!;
    expect(connect).toEqual([...base, ...ORIGINS]);
  });

  it("connect-src 以外のディレクティブと順序は本番設定のまま", () => {
    const base = parseCsp(baseConf.app.security.csp);
    const patched = parseCsp(overlay.app.security.csp);
    expect([...patched.keys()]).toEqual([...base.keys()]);
    for (const [name, values] of base) {
      if (name === "connect-src") continue;
      expect(patched.get(name)).toEqual(values);
    }
  });
});
