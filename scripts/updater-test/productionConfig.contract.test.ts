import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "./constants.mjs";

const PUBKEY =
  "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEJEQjY3QTI4OTMxMUE5OUUKUldTZXFSR1RLSHEydld5MkFzWGFQbWFlUjkvQkNJa28xR2F6UFQ1dlZyaDRGMUo3eWNna09sK2sK";
const ENDPOINT =
  "https://github.com/natsuyasai/multi-column-x/releases/latest/download/latest.json";

const readRepoFile = (...segments: string[]): string =>
  fs.readFileSync(path.join(REPO_ROOT, ...segments), "utf8");

/** Cargo.toml の `[features]` セクション本文を切り出す。 */
export const extractFeaturesSection = (cargoToml: string): string => {
  const match = cargoToml.match(
    /^\[features\]\s*\n([\s\S]*?)(?=^\[|(?![\s\S]))/m,
  );
  return match ? match[1] : "";
};

/** `[features]` の `default = [...]` に含まれる機能名一覧を返す。 */
export const parseDefaultFeatures = (cargoToml: string): string[] => {
  const section = extractFeaturesSection(cargoToml);
  const match = section.match(/^default\s*=\s*\[([\s\S]*?)\]/m);
  if (!match) return [];
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
};

describe("本番の更新設定は試験の仕組みによって変更されない", () => {
  it("更新の公開鍵と取得先は GitHub Releases のまま", () => {
    const conf = JSON.parse(readRepoFile("src-tauri", "tauri.conf.json"));
    expect(conf.plugins.updater.endpoints).toEqual([ENDPOINT]);
    expect(conf.plugins.updater.pubkey).toBe(PUBKEY);
  });

  it("平文通信の許可は有効になっていない", () => {
    const conf = JSON.parse(readRepoFile("src-tauri", "tauri.conf.json"));
    expect(
      conf.plugins.updater.dangerousInsecureTransportProtocol ?? false,
    ).toBe(false);
  });

  it("更新試験機能は既定で無効である", () => {
    const cargo = readRepoFile("src-tauri", "Cargo.toml");
    expect(parseDefaultFeatures(cargo)).not.toContain("updater-test");
    expect(extractFeaturesSection(cargo)).toMatch(
      /^updater-test\s*=\s*\[\s*\]/m,
    );
  });

  it("リリース CI はモック指定・試験指定・更新試験機能のいずれも有効にしない", () => {
    const release = readRepoFile(".github", "workflows", "release.yml");
    for (const forbidden of [
      "VITE_UPDATER_MOCK",
      "VITE_UPDATER_RELEASE_API_BASE",
      "updater-test",
      "tauri.updater-test.conf",
    ]) {
      expect(release).not.toContain(forbidden);
    }
  });

  it("既定機能の解析は updater-test を含む記述を検出できる", () => {
    expect(
      parseDefaultFeatures('[features]\ndefault = ["updater-test"]\n'),
    ).toContain("updater-test");
    expect(
      parseDefaultFeatures(
        '[features]\ndefault = [\n  "a",\n  "updater-test",\n]\n\n[deps]\n',
      ),
    ).toEqual(["a", "updater-test"]);
    expect(
      parseDefaultFeatures("[features]\ndefault = []\nupdater-test = []\n"),
    ).toEqual([]);
  });
});
