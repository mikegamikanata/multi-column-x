import { describe, expect, it } from "vitest";
import {
  buildCommands,
  apkFileName,
  buildEnv,
  findDesktopArtifact,
  mergeReleaseJson,
  parseBuildArgs,
  resolveBuildVersion,
} from "./build.mjs";

describe("parseBuildArgs", () => {
  it("target と role を読み取り emulator は既定で false になる", () => {
    expect(parseBuildArgs(["--target", "windows", "--role", "old"])).toEqual({
      target: "windows",
      role: "old",
      version: undefined,
      notes: undefined,
      emulator: false,
    });
  });

  it("target が不正なときエラーになる", () => {
    expect(() => parseBuildArgs(["--target", "mac", "--role", "old"])).toThrow(
      /--target/,
    );
  });

  it("role が不正なときエラーになる", () => {
    expect(() =>
      parseBuildArgs(["--target", "linux", "--role", "middle"]),
    ).toThrow(/--role/);
  });

  it("version notes emulator の指定を読み取る", () => {
    expect(
      parseBuildArgs([
        "--target",
        "android",
        "--role",
        "new",
        "--version",
        "0.8.7",
        "--notes",
        "hello world",
        "--emulator",
      ]),
    ).toEqual({
      target: "android",
      role: "new",
      version: "0.8.7",
      notes: "hello world",
      emulator: true,
    });
  });
});

describe("resolveBuildVersion", () => {
  it("old で version 省略時は現行バージョンを使う", () => {
    expect(
      resolveBuildVersion({
        role: "old",
        version: undefined,
        baseVersion: "0.8.6",
      }),
    ).toBe("0.8.6");
  });

  it("new で version 省略時はエラーになる", () => {
    expect(() =>
      resolveBuildVersion({
        role: "new",
        version: undefined,
        baseVersion: "0.8.6",
      }),
    ).toThrow(/--version/);
  });

  it.each(["0.8.6", "0.0.1", "0.8.5"])(
    "new で version が現行以下（%s）のときエラーになる",
    (version) => {
      expect(() =>
        resolveBuildVersion({ role: "new", version, baseVersion: "0.8.6" }),
      ).toThrow(/greater/);
    },
  );

  it("new で version が現行より大きければそのまま返す", () => {
    expect(
      resolveBuildVersion({
        role: "new",
        version: "0.8.7",
        baseVersion: "0.8.6",
      }),
    ).toBe("0.8.7");
  });
});

describe("buildCommands", () => {
  const overlay = "tmp/updater-test/tauri.updater-test.conf.json";

  it("windows は inject をビルドしてから nsis だけをバンドルする", () => {
    expect(buildCommands({ target: "windows", overlayPath: overlay })).toEqual([
      { command: "npm", args: ["run", "build:inject"] },
      {
        command: "npx",
        args: ["tauri", "build", "--config", overlay, "--bundles", "nsis"],
      },
    ]);
  });

  it("linux は inject をビルドしてから appimage だけをバンドルする", () => {
    expect(buildCommands({ target: "linux", overlayPath: overlay })).toEqual([
      { command: "npm", args: ["run", "build:inject"] },
      {
        command: "npx",
        args: ["tauri", "build", "--config", overlay, "--bundles", "appimage"],
      },
    ]);
  });

  it("android は debug APK を試験用 feature 付きでビルドする", () => {
    expect(buildCommands({ target: "android", overlayPath: overlay })).toEqual([
      { command: "npm", args: ["run", "build:inject"] },
      {
        command: "npx",
        args: [
          "tauri",
          "android",
          "build",
          "--debug",
          "--apk",
          "--features",
          "updater-test",
          "--config",
          overlay,
        ],
      },
    ]);
  });
});

describe("buildEnv", () => {
  it("署名用の鍵と空パスワードを付与し既存の環境変数は保持する", () => {
    expect(
      buildEnv({
        target: "windows",
        emulator: false,
        keyContent: "KEY",
        baseEnv: { PATH: "/bin" },
      }),
    ).toEqual({
      PATH: "/bin",
      TAURI_SIGNING_PRIVATE_KEY: "KEY",
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "",
    });
  });

  it("android は取得先をローカル配信サーバー（localhost）にする", () => {
    const env = buildEnv({
      target: "android",
      emulator: false,
      keyContent: "KEY",
      baseEnv: {},
    });
    expect(env.VITE_UPDATER_RELEASE_API_BASE).toBe("http://localhost:8787");
  });

  it("android のエミュレータ指定では取得先が 10.0.2.2 になる", () => {
    const env = buildEnv({
      target: "android",
      emulator: true,
      keyContent: "KEY",
      baseEnv: {},
    });
    expect(env.VITE_UPDATER_RELEASE_API_BASE).toBe("http://10.0.2.2:8787");
  });

  it("デスクトップでは取得先の環境変数を付与しない", () => {
    const env = buildEnv({
      target: "linux",
      emulator: true,
      keyContent: "KEY",
      baseEnv: {},
    });
    expect(env).not.toHaveProperty("VITE_UPDATER_RELEASE_API_BASE");
  });
});

describe("mergeReleaseJson", () => {
  const meta = {
    version: "0.8.7",
    notes: "notes",
    pubDate: "2026-01-01T00:00:00.000Z",
  };

  it("既存が無いとき指定プラットフォームだけの release を作る", () => {
    expect(
      mergeReleaseJson(null, {
        ...meta,
        platformKey: "windows",
        entry: { file: "a.exe", sig: "a.exe.sig" },
      }),
    ).toEqual({
      ...meta,
      windows: { file: "a.exe", sig: "a.exe.sig" },
    });
  });

  it("同じ version の既存 release では他プラットフォームを保持する", () => {
    const existing = {
      ...meta,
      linux: { file: "b.AppImage", sig: "b.AppImage.sig" },
    };
    expect(
      mergeReleaseJson(existing, {
        ...meta,
        platformKey: "windows",
        entry: { file: "a.exe", sig: "a.exe.sig" },
      }),
    ).toEqual({
      ...meta,
      linux: { file: "b.AppImage", sig: "b.AppImage.sig" },
      windows: { file: "a.exe", sig: "a.exe.sig" },
    });
  });

  it("version が変わったとき他プラットフォームは破棄する", () => {
    const existing = {
      version: "0.8.6",
      notes: "old",
      pubDate: "2025-01-01T00:00:00.000Z",
      linux: { file: "b.AppImage", sig: "b.AppImage.sig" },
    };
    const merged = mergeReleaseJson(existing, {
      ...meta,
      platformKey: "windows",
      entry: { file: "a.exe", sig: "a.exe.sig" },
    });
    expect(merged).toEqual({
      ...meta,
      windows: { file: "a.exe", sig: "a.exe.sig" },
    });
  });
});

describe("findDesktopArtifact", () => {
  it("windows は指定バージョンの setup.exe とその sig を見つける", () => {
    const files = [
      "MultiColumnX_0.8.6_x64-setup.exe",
      "MultiColumnX_0.8.7_x64-setup.exe",
      "MultiColumnX_0.8.7_x64-setup.exe.sig",
    ];
    expect(findDesktopArtifact(files, "windows", "0.8.7")).toEqual({
      file: "MultiColumnX_0.8.7_x64-setup.exe",
      sig: "MultiColumnX_0.8.7_x64-setup.exe.sig",
    });
  });

  it("linux は指定バージョンの AppImage とその sig を見つける", () => {
    const files = [
      "MultiColumnX_0.8.7_amd64.AppImage",
      "MultiColumnX_0.8.7_amd64.AppImage.sig",
    ];
    expect(findDesktopArtifact(files, "linux", "0.8.7")).toEqual({
      file: "MultiColumnX_0.8.7_amd64.AppImage",
      sig: "MultiColumnX_0.8.7_amd64.AppImage.sig",
    });
  });

  it("sig が無いときは null を返す", () => {
    expect(
      findDesktopArtifact(
        ["MultiColumnX_0.8.7_x64-setup.exe"],
        "windows",
        "0.8.7",
      ),
    ).toBeNull();
  });

  it("該当バージョンの成果物が無いときは null を返す", () => {
    expect(
      findDesktopArtifact(
        [
          "MultiColumnX_0.8.6_x64-setup.exe",
          "MultiColumnX_0.8.6_x64-setup.exe.sig",
        ],
        "windows",
        "0.8.7",
      ),
    ).toBeNull();
  });
});

describe("apkFileName", () => {
  it("空白を含まないバージョン付きの名前になる", () => {
    const name = apkFileName("0.8.7");
    expect(name).toBe("multicolumnx-0.8.7-universal-debug.apk");
    expect(name).not.toMatch(/\s/);
  });
});
