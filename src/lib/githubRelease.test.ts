import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchLatestRelease,
  fetchWhatsNewSelection,
  parseDigestSha256,
  parseLatestRelease,
  selectWhatsNewEntries,
} from "./githubRelease";

const VALID_SHA256 = "0123456789abcdef".repeat(4);

describe("parseLatestRelease", () => {
  it("tagからvを除いたversionとapk資産URLとbodyを返す", () => {
    const json = {
      tag_name: "v1.2.0",
      body: "修正",
      assets: [
        { name: "latest.json", browser_download_url: "https://x/latest.json" },
        {
          name: "MultiColumnX_1.2.0_universal.apk",
          browser_download_url: "https://x/app.apk",
        },
      ],
    };
    expect(parseLatestRelease(json)).toEqual({
      version: "1.2.0",
      notes: "修正",
      apkUrl: "https://x/app.apk",
    });
  });

  it("apk資産が無ければnull", () => {
    expect(parseLatestRelease({ tag_name: "v1.2.0", assets: [] })).toBeNull();
  });

  it("tag_nameが無ければnull", () => {
    expect(parseLatestRelease({ assets: [] })).toBeNull();
  });

  it("apkアセットのdigestからapkSha256(小文字hex)を設定する", () => {
    const json = {
      tag_name: "v1.2.0",
      body: "修正",
      assets: [
        {
          name: "MultiColumnX_1.2.0_universal.apk",
          browser_download_url: "https://x/app.apk",
          digest: `sha256:${VALID_SHA256.toUpperCase()}`,
        },
      ],
    };
    expect(parseLatestRelease(json)).toEqual({
      version: "1.2.0",
      notes: "修正",
      apkUrl: "https://x/app.apk",
      apkSha256: VALID_SHA256,
    });
  });

  it("digestが無ければapkSha256はundefined", () => {
    const json = {
      tag_name: "v1.2.0",
      body: "修正",
      assets: [
        {
          name: "MultiColumnX_1.2.0_universal.apk",
          browser_download_url: "https://x/app.apk",
        },
      ],
    };
    expect(parseLatestRelease(json)?.apkSha256).toBeUndefined();
  });

  it("digestがsha256でなければapkSha256はundefined", () => {
    const json = {
      tag_name: "v1.2.0",
      body: "修正",
      assets: [
        {
          name: "MultiColumnX_1.2.0_universal.apk",
          browser_download_url: "https://x/app.apk",
          digest: `sha512:${VALID_SHA256}`,
        },
      ],
    };
    expect(parseLatestRelease(json)?.apkSha256).toBeUndefined();
  });
});

describe("parseDigestSha256", () => {
  it("sha256プレフィックス付き64桁hexを小文字で返す", () => {
    expect(parseDigestSha256(`sha256:${VALID_SHA256}`)).toBe(VALID_SHA256);
  });

  it("大文字hexを小文字に正規化する", () => {
    expect(parseDigestSha256(`sha256:${VALID_SHA256.toUpperCase()}`)).toBe(
      VALID_SHA256,
    );
  });

  it("undefinedはnull", () => {
    expect(parseDigestSha256(undefined)).toBeNull();
  });

  it("プレフィックスが無ければnull", () => {
    expect(parseDigestSha256(VALID_SHA256)).toBeNull();
  });

  it("sha256以外のアルゴリズム(sha512:)はnull", () => {
    expect(parseDigestSha256(`sha512:${VALID_SHA256}`)).toBeNull();
  });

  it("hexが64桁でなければnull(短い)", () => {
    expect(parseDigestSha256(`sha256:${VALID_SHA256.slice(0, 63)}`)).toBeNull();
  });

  it("hexが64桁でなければnull(長い)", () => {
    expect(parseDigestSha256(`sha256:${VALID_SHA256}0`)).toBeNull();
  });

  it("非hex文字を含めばnull", () => {
    expect(
      parseDigestSha256(`sha256:${VALID_SHA256.slice(0, 63)}g`),
    ).toBeNull();
  });
});

describe("リリース情報の取得先", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function fetchedUrls(): Promise<string[]> {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tag_name: "v1.2.0", body: "n", assets: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);
    await fetchLatestRelease();
    await fetchWhatsNewSelection("0.0.0", "1.2.0");
    return mockFetch.mock.calls.map((c) => c[0] as string);
  }

  it("試験ビルド指定のときリリース情報の取得先がローカル配信サーバーになる", async () => {
    vi.stubEnv("VITE_UPDATER_RELEASE_API_BASE", "http://localhost:8787");
    expect(await fetchedUrls()).toEqual([
      "http://localhost:8787/repos/natsuyasai/multi-column-x/releases/latest",
      "http://localhost:8787/repos/natsuyasai/multi-column-x/releases?per_page=30",
    ]);
  });

  it("試験ビルド指定が無いときリリース情報の取得先はGitHubのままである", async () => {
    vi.stubEnv("VITE_UPDATER_RELEASE_API_BASE", "");
    expect(await fetchedUrls()).toEqual([
      "https://api.github.com/repos/natsuyasai/multi-column-x/releases/latest",
      "https://api.github.com/repos/natsuyasai/multi-column-x/releases?per_page=30",
    ]);
  });
});

interface TestRelease {
  tag_name: string;
  body?: string | null;
  draft?: boolean;
  prerelease?: boolean;
}

function release(
  version: string,
  body: string | null | undefined = `${version}の更新内容`,
  flags: { draft?: boolean; prerelease?: boolean } = {},
): TestRelease {
  return { tag_name: `v${version}`, body, ...flags };
}

describe("selectWhatsNewEntries", () => {
  it("前回から今回までの間に複数のバージョンがあるとき新しい順に並べて表示する", () => {
    const json = [
      release("0.8.1", "本文0.8.1"),
      release("0.9.1", "本文0.9.1"),
      release("0.9.0", "本文0.9.0"),
    ];

    expect(selectWhatsNewEntries(json, "0.8.0", "0.9.1")).toEqual({
      entries: [
        { version: "0.9.1", notes: "本文0.9.1" },
        { version: "0.9.0", notes: "本文0.9.0" },
        { version: "0.8.1", notes: "本文0.8.1" },
      ],
      hasMore: false,
    });
  });

  it("前回のバージョン以前のリリースは表示しない", () => {
    const json = [release("0.9.1"), release("0.9.0")];

    const result = selectWhatsNewEntries(json, "0.9.0", "0.9.1");

    expect(result.entries.map((e) => e.version)).toEqual(["0.9.1"]);
  });

  it("今回のバージョンより新しいリリースは表示しない", () => {
    const json = [release("0.9.1"), release("0.9.0")];

    const result = selectWhatsNewEntries(json, "0.8.0", "0.9.0");

    expect(result.entries.map((e) => e.version)).toEqual(["0.9.0"]);
  });

  it("下書きとプレリリースは表示しない", () => {
    const json = [
      release("0.9.1"),
      release("0.9.0", "本文", { draft: true }),
      release("0.8.1", "本文", { prerelease: true }),
    ];

    const result = selectWhatsNewEntries(json, "0.8.0", "0.9.1");

    expect(result.entries.map((e) => e.version)).toEqual(["0.9.1"]);
  });

  it("範囲内のバージョンが4件以上あるとき最新から3件だけ表示し省略の注記を出す", () => {
    const json = ["0.6.0", "0.8.0", "0.8.1", "0.9.0", "0.9.1"].map((v) =>
      release(v),
    );

    const result = selectWhatsNewEntries(json, "0.5.0", "0.9.1");

    expect(result.entries.map((e) => e.version)).toEqual([
      "0.9.1",
      "0.9.0",
      "0.8.1",
    ]);
    expect(result.hasMore).toBe(true);
  });

  it.each([3, 2, 1])(
    "範囲内のバージョンが3件以下(%i件)のとき省略の注記は表示しない",
    (count) => {
      const json = ["0.9.1", "0.9.0", "0.8.1"]
        .slice(0, count)
        .map((v) => release(v));

      const result = selectWhatsNewEntries(json, "0.8.0", "0.9.1");

      expect(result.entries).toHaveLength(count);
      expect(result.hasMore).toBe(false);
    },
  );

  it.each([
    ["空文字", release("0.9.0", "")],
    ["空白のみ", release("0.9.0", " \n\t ")],
    ["null", release("0.9.0", null)],
    ["undefined", { tag_name: "v0.9.0" }],
  ])(
    "一部のバージョンの本文が空(%s)のときはそのバージョンを飛ばして残りを表示する",
    (_label, emptyBodyRelease) => {
      const json = [release("0.9.1"), emptyBodyRelease, release("0.8.1")];

      const result = selectWhatsNewEntries(json, "0.8.0", "0.9.1");

      expect(result.entries.map((e) => e.version)).toEqual(["0.9.1", "0.8.1"]);
    },
  );

  it("本文が空のバージョンは上限の3件に数えない", () => {
    const json = [
      release("0.9.1", ""),
      release("0.9.0"),
      release("0.8.3"),
      release("0.8.2"),
      release("0.8.1"),
    ];

    const result = selectWhatsNewEntries(json, "0.8.0", "0.9.1");

    expect(result.entries.map((e) => e.version)).toEqual([
      "0.9.0",
      "0.8.3",
      "0.8.2",
    ]);
    expect(result.hasMore).toBe(true);
  });

  it("本文のあるバージョンが上限ちょうどのとき本文が空のバージョンがあっても省略の注記は出ない", () => {
    const json = [
      release("0.9.1", " "),
      release("0.9.0"),
      release("0.8.3"),
      release("0.8.2"),
    ];

    const result = selectWhatsNewEntries(json, "0.8.0", "0.9.1");

    expect(result.entries).toHaveLength(3);
    expect(result.hasMore).toBe(false);
  });

  it("範囲内に本文のあるリリースが1件も無いときentriesが空でhasMoreはfalseになる", () => {
    const json = [release("0.9.1", ""), release("0.9.0", null)];

    expect(selectWhatsNewEntries(json, "0.8.0", "0.9.1")).toEqual({
      entries: [],
      hasMore: false,
    });
  });

  it("tag_nameのvの有無や大文字小文字に関わらずversionはv無しで返る", () => {
    const json = [
      { tag_name: "v0.9.1", body: "a" },
      { tag_name: "V0.9.0", body: "b" },
      { tag_name: "0.8.1", body: "c" },
    ];

    const result = selectWhatsNewEntries(json, "0.8.0", "0.9.1");

    expect(result.entries.map((e) => e.version)).toEqual([
      "0.9.1",
      "0.9.0",
      "0.8.1",
    ]);
  });

  it("本文は前後の空白を含む原文のまま返す", () => {
    const body = "\n## 修正\n- 項目\n";

    const result = selectWhatsNewEntries(
      [release("0.9.1", body)],
      "0.9.0",
      "0.9.1",
    );

    expect(result.entries[0].notes).toBe(body);
  });

  it("配列でない応答は空の結果になる", () => {
    for (const json of [null, undefined, {}, "x", 1, { tag_name: "v0.9.1" }]) {
      expect(selectWhatsNewEntries(json, "0.8.0", "0.9.1")).toEqual({
        entries: [],
        hasMore: false,
      });
    }
  });

  it("要素がnullや不正な型でも落ちずに無視する", () => {
    const json = [
      null,
      undefined,
      1,
      "v0.9.0",
      [],
      {},
      { tag_name: 1, body: "x" },
      { tag_name: "", body: "x" },
      { tag_name: "v0.9.0", body: 5 },
      { tag_name: "v0.9.0", body: "x", draft: "true" },
      release("0.9.1"),
    ];

    const result = selectWhatsNewEntries(json, "0.8.0", "0.9.1");

    expect(result.entries.map((e) => e.version)).toEqual(["0.9.1", "0.9.0"]);
  });
});

describe("fetchWhatsNewSelection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("一覧APIを1回だけ呼び、前回から今回までのリリースノートを選別して返す", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [release("0.9.0", "本文0.9.0"), release("0.8.0")],
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchWhatsNewSelection("0.8.0", "0.9.1");

    expect(result).toEqual({
      entries: [{ version: "0.9.0", notes: "本文0.9.0" }],
      hasMore: false,
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toMatch(/\/releases\?per_page=30$/);
    expect(calledUrl).not.toContain("tags/");
  });

  it("リリースの一覧を取得できないとき(res.okがfalse)nullを返す", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    expect(await fetchWhatsNewSelection("0.8.0", "0.9.1")).toBeNull();
  });

  it("fetchが失敗したときは例外を呼び元へ伝える", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    await expect(fetchWhatsNewSelection("0.8.0", "0.9.1")).rejects.toThrow(
      "network",
    );
  });
});
