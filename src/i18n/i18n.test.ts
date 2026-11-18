import { afterEach, describe, expect, it } from "vitest";
import i18n from "@/i18n";

const TEST_NS = "i18nTest";

// テスト専用の名前空間は型付き辞書に無いため、キー型を緩めた翻訳関数を使う
const translate = (key: string, options: Record<string, unknown>): string =>
  (
    i18n.t as unknown as (
      key: string,
      options: Record<string, unknown>,
    ) => string
  )(key, options);

describe("i18n", () => {
  afterEach(() => {
    i18n.removeResourceBundle("ja", TEST_NS);
    i18n.removeResourceBundle("en", TEST_NS);
  });

  it("辞書に無いキーが指定されたとき日本語の訳文にフォールバックする", async () => {
    i18n.addResourceBundle(
      "ja",
      TEST_NS,
      { onlyJa: "日本語だけの文言" },
      true,
      true,
    );
    await i18n.changeLanguage("en");

    expect(translate("onlyJa", { ns: TEST_NS })).toBe("日本語だけの文言");
  });

  it("実キーの補間は言語ごとの語順で値が埋め込まれる", async () => {
    const params = { base: "基本", detail: "値" };

    await i18n.changeLanguage("ja");
    expect(i18n.t("messages:backup.error.withDetail", params)).toBe(
      "基本（値）",
    );

    await i18n.changeLanguage("en");
    expect(i18n.t("messages:backup.error.withDetail", params)).toBe(
      "基本 (値)",
    );
    expect(i18n.t("columns:pageType.searchWithQuery", { query: "q" })).toBe(
      "Search: q",
    );
  });

  it("補間変数を持つ訳文に値を渡すと文中に埋め込まれる", async () => {
    i18n.addResourceBundle(
      "ja",
      TEST_NS,
      { withCount: "件数: {{count}}件" },
      true,
      true,
    );
    i18n.addResourceBundle(
      "en",
      TEST_NS,
      { withCount: "{{count}} items" },
      true,
      true,
    );
    await i18n.changeLanguage("en");

    expect(translate("withCount", { ns: TEST_NS, count: 3 })).toBe("3 items");
  });

  it("補間値に含まれるHTML特殊文字はエスケープされずそのまま埋め込まれる", async () => {
    i18n.addResourceBundle(
      "ja",
      TEST_NS,
      { greet: "こんにちは {{name}}" },
      true,
      true,
    );
    await i18n.changeLanguage("ja");

    expect(translate("greet", { ns: TEST_NS, name: "<b>A&B</b>" })).toBe(
      "こんにちは <b>A&B</b>",
    );
  });

  it("どの言語にも無いキーはキー文字列そのものが返る", async () => {
    await i18n.changeLanguage("en");

    expect(translate("noSuchKey", { ns: TEST_NS })).toBe("noSuchKey");
    expect(i18n.t("common:noSuchKey" as never)).toBe("noSuchKey");
  });

  it("名前空間付きキーと既定名前空間のキーは同じ訳文に解決される", async () => {
    await i18n.changeLanguage("en");
    const resolved = i18n.t("columns:pageType.searchWithQuery", { query: "q" });

    expect(resolved).toBe("Search: q");
    // 名前空間を省略したキーは既定名前空間（common）に解決される
    expect(i18n.t("language.en" as never)).toBe("English");
    expect(
      i18n.t(
        "pageType.searchWithQuery" as never,
        {
          ns: "columns",
          query: "q",
        } as never,
      ),
    ).toBe(resolved);
  });

  it("実キーの複数形は英語で単数形と複数形が件数で切り替わり日本語では同一表現になる", async () => {
    await i18n.changeLanguage("en");
    expect(i18n.t("settings:backup.mapping.columnCount", { count: 1 })).toBe(
      "1 column",
    );
    expect(i18n.t("settings:backup.mapping.columnCount", { count: 2 })).toBe(
      "2 columns",
    );

    await i18n.changeLanguage("ja");
    expect(i18n.t("settings:backup.mapping.columnCount", { count: 1 })).toBe(
      "カラム 1 件",
    );
    expect(i18n.t("settings:backup.mapping.columnCount", { count: 2 })).toBe(
      "カラム 2 件",
    );
  });

  it("言語を切り替えると現在の言語が更新され languageChanged が通知される", async () => {
    const changed: string[] = [];
    const listener = (lng: string) => changed.push(lng);
    i18n.on("languageChanged", listener);
    try {
      await i18n.changeLanguage("en");
      await i18n.changeLanguage("ja");
    } finally {
      i18n.off("languageChanged", listener);
    }

    expect(changed).toEqual(["en", "ja"]);
    expect(i18n.language).toBe("ja");
  });
});
