import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseLatestRelease } from "../../src/lib/githubRelease";
import {
  buildGithubRelease,
  buildLatestJson,
  compareVersions,
  resolveArtifactPath,
  resolveOrigin,
  routeRequest,
} from "./manifest.mjs";

const SHA256 = "a".repeat(64);
const ORIGIN = "http://localhost:8787";
const APK_NAME = "multicolumnx-0.9.0-universal-debug.apk";
const APK_URL_PREFIX = "http://localhost:8787/download/";

const release = {
  version: "0.9.0",
  notes: "試験用リリースノート",
  pubDate: "2026-11-19T00:00:00.000Z",
  windows: { file: "app_0.9.0_x64-setup.exe", signature: "SIG-WIN" },
  linux: { file: "app_0.9.0_amd64.AppImage", signature: "SIG-LINUX" },
  apk: { file: APK_NAME, sha256: SHA256 },
};

describe("配信サーバーは成果物から署名入りのデスクトップ更新情報を生成する", () => {
  it("更新情報にバージョン・リリースノート・公開日時と各プラットフォームの署名・ローカルURLが含まれる", () => {
    const result = routeRequest({
      method: "GET",
      pathname: "/latest.json",
      host: "localhost:8787",
      release,
    });

    expect(result).toEqual({
      kind: "json",
      status: 200,
      body: {
        version: "0.9.0",
        notes: "試験用リリースノート",
        pub_date: "2026-11-19T00:00:00.000Z",
        platforms: {
          "windows-x86_64": {
            signature: "SIG-WIN",
            url: `${ORIGIN}/download/app_0.9.0_x64-setup.exe`,
          },
          "linux-x86_64": {
            signature: "SIG-LINUX",
            url: `${ORIGIN}/download/app_0.9.0_amd64.AppImage`,
          },
        },
      },
    });
  });

  it("片方のプラットフォームしか無いときはそのプラットフォームだけを含む", () => {
    const body = buildLatestJson({
      version: "0.9.0",
      notes: "n",
      pubDate: "2026-11-19T00:00:00.000Z",
      origin: ORIGIN,
      platforms: {
        "windows-x86_64": { signature: "S", fileName: "a b.exe" },
      },
    });

    expect(Object.keys(body.platforms)).toEqual(["windows-x86_64"]);
    // 空白を含むファイル名は URL エンコードされる
    expect(body.platforms["windows-x86_64"].url).toBe(
      `${ORIGIN}/download/a%20b.exe`,
    );
  });
});

describe("配信サーバーはAPKのハッシュ付きでリリース情報を返す", () => {
  it("最新リリース情報にタグ名・リリースノート・APKのURL・sha256ダイジェストが含まれる", () => {
    const result = routeRequest({
      method: "GET",
      pathname: "/repos/natsuyasai/multi-column-x/releases/latest",
      host: "localhost:8787",
      release,
    });

    expect(result).toEqual({
      kind: "json",
      status: 200,
      body: {
        tag_name: "v0.9.0",
        body: "試験用リリースノート",
        assets: [
          {
            name: APK_NAME,
            browser_download_url: `${APK_URL_PREFIX}${APK_NAME}`,
            digest: `sha256:${SHA256}`,
          },
        ],
      },
    });
  });

  it("アプリのリリース情報解析がそのまま解釈でき、APKのURLはRust側の許可プレフィックスで始まり空白を含まない", () => {
    const result = routeRequest({
      method: "GET",
      pathname: "/repos/natsuyasai/multi-column-x/releases/latest",
      host: "localhost:8787",
      release,
    });
    if (result.kind !== "json") throw new Error("json を期待");

    const parsed = parseLatestRelease(result.body);

    expect(parsed).toEqual({
      version: "0.9.0",
      notes: "試験用リリースノート",
      apkUrl: `${APK_URL_PREFIX}${APK_NAME}`,
      apkSha256: SHA256,
    });
    expect(parsed?.apkUrl.startsWith(APK_URL_PREFIX)).toBe(true);
    expect(parsed?.apkUrl).not.toMatch(/\s/);
  });

  it("エミュレータ向けホストで要求するとAPKのURLもそのホストになる", () => {
    const result = routeRequest({
      method: "GET",
      pathname: "/repos/natsuyasai/multi-column-x/releases/latest",
      host: "10.0.2.2:8787",
      release,
    });
    if (result.kind !== "json") throw new Error("json を期待");

    expect(parseLatestRelease(result.body)?.apkUrl).toBe(
      `http://10.0.2.2:8787/download/${APK_NAME}`,
    );
  });

  it("ダイジェスト不一致指定のときは正しいハッシュ以外のダイジェストを返す", () => {
    const body = buildGithubRelease({
      version: "0.9.0",
      notes: "n",
      origin: ORIGIN,
      apk: { fileName: APK_NAME, sha256: SHA256 },
      badDigest: true,
    });

    expect(body.assets[0].digest).toBe(`sha256:${"0".repeat(64)}`);
  });

  it("APKが無いときは成果物の一覧が空になる", () => {
    const body = buildGithubRelease({
      version: "0.9.0",
      notes: "n",
      origin: ORIGIN,
    });

    expect(body.assets).toEqual([]);
  });
});

describe("配信サーバーは指定タグのリリースノートを返す", () => {
  it("そのバージョンのタグで要求するとリリースノートが返る", () => {
    const result = routeRequest({
      method: "GET",
      pathname: "/repos/natsuyasai/multi-column-x/releases/tags/v0.9.0",
      host: "localhost:8787",
      release,
    });

    expect(result.kind).toBe("json");
    if (result.kind !== "json") return;
    expect((result.body as { body: string }).body).toBe("試験用リリースノート");
  });

  it("別バージョンのタグで要求すると見つからない応答になる", () => {
    const result = routeRequest({
      method: "GET",
      pathname: "/repos/natsuyasai/multi-column-x/releases/tags/v0.1.0",
      host: "localhost:8787",
      release,
    });

    expect(result).toEqual({ kind: "notFound" });
  });
});

describe("配信サーバーは配信対象外のパスを要求されたとき拒否する", () => {
  const root = path.resolve("tmp", "updater-test", "artifacts");

  it.each([
    ["エンコードされた上位ディレクトリ", "/download/..%2F..%2Fpackage.json"],
    ["生の上位ディレクトリ", "/download/../x"],
    ["絶対パス", "/download/%2Fetc%2Fpasswd"],
    ["Windows 形式の絶対パス", "/download/C%3A%5CWindows%5Cwin.ini"],
    ["バックスラッシュ区切り", "/download/..%5Cx"],
    ["ドットのみ", "/download/.."],
    ["空のファイル名", "/download/"],
    ["不正なエスケープ", "/download/%E0%A4%A"],
  ])("%s を要求するとファイルは返らず見つからない応答になる", (_name, p) => {
    const result = routeRequest({
      method: "GET",
      pathname: p,
      host: "localhost:8787",
      release,
    });

    expect(result).toEqual({ kind: "notFound" });
  });

  it.each(["../package.json", "..", "/etc/passwd", "a/b", "a\\b", ""])(
    "成果物ディレクトリの外を指す %j は解決されない",
    (name) => {
      expect(resolveArtifactPath(root, name)).toBeNull();
    },
  );

  it("成果物ディレクトリ直下の通常のファイル名は配下のパスに解決される", () => {
    expect(resolveArtifactPath(root, APK_NAME)).toBe(path.join(root, APK_NAME));
  });

  it("成果物ディレクトリ直下のファイルを要求するとファイル配信になる", () => {
    const result = routeRequest({
      method: "GET",
      pathname: `/download/${encodeURIComponent("app_0.9.0_x64-setup.exe")}`,
      host: "localhost:8787",
      release,
    });

    expect(result).toEqual({
      kind: "file",
      fileName: "app_0.9.0_x64-setup.exe",
    });
  });

  it("配信対象外の経路は見つからない応答になる", () => {
    const result = routeRequest({
      method: "GET",
      pathname: "/release.json",
      host: "localhost:8787",
      release,
    });

    expect(result).toEqual({ kind: "notFound" });
  });
});

describe("compareVersions", () => {
  it("大きいバージョンは1、小さいバージョンは-1、同じなら0を返す", () => {
    expect(compareVersions("0.9.0", "0.8.6")).toBe(1);
    expect(compareVersions("0.8.6", "0.9.0")).toBe(-1);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });

  it("桁数の多い数値を文字列ではなく数値として比較する", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBe(1);
  });

  it("先頭のvは無視する", () => {
    expect(compareVersions("v0.8.7", "0.8.6")).toBe(1);
  });
});

describe("resolveOrigin", () => {
  it.each(["localhost:8787", "127.0.0.1:8787", "10.0.2.2:8787"])(
    "許可ホスト %s はそのホストのオリジンになる",
    (host) => {
      expect(resolveOrigin(host)).toBe(`http://${host}`);
    },
  );

  it("未知のホストや未指定はlocalhostのオリジンになる", () => {
    expect(resolveOrigin("evil.example:8787")).toBe("http://localhost:8787");
    expect(resolveOrigin(undefined)).toBe("http://localhost:8787");
  });
});

describe("routeRequest のメソッド処理", () => {
  it("OPTIONSはプリフライト応答になる", () => {
    expect(
      routeRequest({
        method: "OPTIONS",
        pathname: "/latest.json",
        host: "localhost:8787",
        release,
      }),
    ).toEqual({ kind: "preflight" });
  });

  it("GET以外のメソッドは見つからない応答になる", () => {
    expect(
      routeRequest({
        method: "POST",
        pathname: "/latest.json",
        host: "localhost:8787",
        release,
      }),
    ).toEqual({ kind: "notFound" });
  });
});
