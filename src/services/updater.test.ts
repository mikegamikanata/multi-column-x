import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IPC_COMMANDS } from "@/constants/ipc";
import { fetchLatestRelease } from "../lib/githubRelease";
import { createUpdater } from "./updater";

vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../lib/githubRelease", () => ({
  fetchLatestRelease: vi.fn(),
}));

const DUMMY_SHA256 = "0123456789abcdef".repeat(4);

describe("desktop updater", () => {
  beforeEach(() => vi.clearAllMocks());

  it("更新があればversionとnotesを返す", async () => {
    vi.mocked(check).mockResolvedValue({
      version: "1.2.0",
      body: "fixes",
      downloadAndInstall: vi.fn().mockResolvedValue(undefined),
    } as never);
    const u = createUpdater(false);
    expect(await u.check()).toEqual({ version: "1.2.0", notes: "fixes" });
  });

  it("更新が無ければnullを返す", async () => {
    vi.mocked(check).mockResolvedValue(null as never);
    const u = createUpdater(false);
    expect(await u.check()).toBeNull();
  });

  it("更新のインストール後にアプリの再起動処理が呼ばれる", async () => {
    const dl = vi.fn().mockResolvedValue(undefined);
    vi.mocked(check).mockResolvedValue({
      version: "1.2.0",
      body: "",
      downloadAndInstall: dl,
    } as never);
    const u = createUpdater(false);
    await u.check();
    const progress = vi.fn();
    await u.install(progress);
    expect(dl).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(IPC_COMMANDS.RELAUNCH_APP);
    // ダウンロードとインストールの完了後、restarting 通知の後に呼ばれる
    const relaunchOrder = vi.mocked(invoke).mock.invocationCallOrder[0];
    expect(dl.mock.invocationCallOrder[0]).toBeLessThan(relaunchOrder);
    const restartingIdx = progress.mock.calls.findIndex(
      (c) => c[0].phase === "restarting",
    );
    expect(progress.mock.invocationCallOrder[restartingIdx]).toBeLessThan(
      relaunchOrder,
    );
  });

  it("installはダウンロードイベントを進捗通知へ変換する", async () => {
    // downloadAndInstall に渡された onEvent を呼び出してイベント列を再現する。
    const dl = vi.fn().mockImplementation(async (onEvent) => {
      onEvent({ event: "Started", data: { contentLength: 1000 } });
      onEvent({ event: "Progress", data: { chunkLength: 400 } });
      onEvent({ event: "Progress", data: { chunkLength: 600 } });
      onEvent({ event: "Finished" });
    });
    vi.mocked(check).mockResolvedValue({
      version: "1.2.0",
      body: "",
      downloadAndInstall: dl,
    } as never);
    const u = createUpdater(false);
    await u.check();
    const progress = vi.fn();
    await u.install(progress);
    expect(progress.mock.calls.map((c) => c[0])).toEqual([
      { phase: "downloading", downloaded: 0, total: 1000 },
      { phase: "downloading", downloaded: 400, total: 1000 },
      { phase: "downloading", downloaded: 1000, total: 1000 },
      { phase: "installing" },
      { phase: "restarting" },
    ]);
  });

  it("contentLengthが無い場合はtotalをnullで通知する", async () => {
    const dl = vi.fn().mockImplementation(async (onEvent) => {
      onEvent({ event: "Started", data: {} });
      onEvent({ event: "Progress", data: { chunkLength: 400 } });
      onEvent({ event: "Finished" });
    });
    vi.mocked(check).mockResolvedValue({
      version: "1.2.0",
      body: "",
      downloadAndInstall: dl,
    } as never);
    const u = createUpdater(false);
    await u.check();
    const progress = vi.fn();
    await u.install(progress);
    expect(progress.mock.calls[0][0]).toEqual({
      phase: "downloading",
      downloaded: 0,
      total: null,
    });
  });
});

describe("mobile updater", () => {
  beforeEach(() => vi.clearAllMocks());

  it("新しいバージョンがあればversion/notesを返す", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(fetchLatestRelease).mockResolvedValue({
      version: "1.2.0",
      notes: "n",
      apkUrl: "u",
    });
    const u = createUpdater(true);
    expect(await u.check()).toEqual({ version: "1.2.0", notes: "n" });
  });

  it("同一バージョンならnull", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.2.0");
    vi.mocked(fetchLatestRelease).mockResolvedValue({
      version: "1.2.0",
      apkUrl: "u",
    });
    const u = createUpdater(true);
    expect(await u.check()).toBeNull();
  });

  it("installはcheckで得たapkUrlとdigest由来のsha256でinstall_apk_updateを呼ぶ", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(fetchLatestRelease).mockResolvedValue({
      version: "1.2.0",
      apkUrl: "https://x/app.apk",
      apkSha256: DUMMY_SHA256,
    });
    const u = createUpdater(true);
    await u.check();
    await u.install();
    expect(invoke).toHaveBeenCalledWith("install_apk_update", {
      url: "https://x/app.apk",
      expectedSha256: DUMMY_SHA256,
    });
  });

  it("installは進捗チャネルが無いため不確定のダウンロード状態を通知する", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(fetchLatestRelease).mockResolvedValue({
      version: "1.2.0",
      apkUrl: "https://x/app.apk",
      apkSha256: DUMMY_SHA256,
    });
    const u = createUpdater(true);
    await u.check();
    const progress = vi.fn();
    await u.install(progress);
    expect(progress).toHaveBeenCalledWith({
      phase: "downloading",
      downloaded: 0,
      total: null,
    });
  });

  it("installはinvoke完了後にawaitingInstallを通知する", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(fetchLatestRelease).mockResolvedValue({
      version: "1.2.0",
      apkUrl: "https://x/app.apk",
      apkSha256: DUMMY_SHA256,
    });
    const u = createUpdater(true);
    await u.check();
    const progress = vi.fn();
    await u.install(progress);
    expect(progress.mock.calls.map((c) => c[0])).toEqual([
      { phase: "downloading", downloaded: 0, total: null },
      { phase: "awaitingInstall" },
    ]);
  });

  it("apkSha256が無ければinstallはエラーを投げる", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(fetchLatestRelease).mockResolvedValue({
      version: "1.2.0",
      apkUrl: "https://x/app.apk",
    });
    const u = createUpdater(true);
    await u.check();
    await expect(u.install()).rejects.toThrow();
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("モック指定の切り替え", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("モック種別を指定しないときデスクトップは本物の更新確認を使う", async () => {
    vi.stubEnv("VITE_UPDATER_MOCK", "");
    vi.mocked(check).mockResolvedValue(null as never);
    await createUpdater(false).check();
    expect(check).toHaveBeenCalledOnce();
  });

  it("モック種別を指定しないときモバイルは本物のリリース取得を使う", async () => {
    vi.stubEnv("VITE_UPDATER_MOCK", "");
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(fetchLatestRelease).mockResolvedValue(null);
    await createUpdater(true).check();
    expect(fetchLatestRelease).toHaveBeenCalledOnce();
  });

  it("未知のモック種別を指定したとき本物の更新確認を使う", async () => {
    vi.stubEnv("VITE_UPDATER_MOCK", "unknown");
    vi.mocked(check).mockResolvedValue(null as never);
    await createUpdater(false).check();
    expect(check).toHaveBeenCalledOnce();
  });

  it("未知のモック種別を指定したときモバイルは本物のリリース取得を使う", async () => {
    vi.stubEnv("VITE_UPDATER_MOCK", "unknown");
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(fetchLatestRelease).mockResolvedValue(null);
    await createUpdater(true).check();
    expect(fetchLatestRelease).toHaveBeenCalledOnce();
  });
});
