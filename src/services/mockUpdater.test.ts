import { invoke } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import { describe, expect, it, vi } from "vitest";
import {
  createMockUpdater,
  parseMockUpdaterKind,
  type MockUpdaterKind,
} from "./mockUpdater";
import type { UpdateProgress } from "./updater";

vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const instant = () => Promise.resolve();

describe("モック指定でビルドしたとき指定どおりの更新確認結果になる", () => {
  it.each([
    ["available", "新しいバージョンが見つかる"],
    ["install-error", "新しいバージョンが見つかる"],
    ["slow-progress", "新しいバージョンが見つかる"],
  ] as [MockUpdaterKind, string][])("%s: %s", async (kind) => {
    const u = createMockUpdater(kind, { sleep: instant });
    const result = await u.check();
    expect(result?.version).toBeTruthy();
  });

  it("none: 更新は無い", async () => {
    const u = createMockUpdater("none", { sleep: instant });
    expect(await u.check()).toBeNull();
  });

  it("check-error: 確認に失敗する", async () => {
    const u = createMockUpdater("check-error", { sleep: instant });
    await expect(u.check()).rejects.toThrow();
  });
});

describe("モックで更新を適用する", () => {
  it("ダウンロード進捗から再起動直前まで段階的に通知される", async () => {
    const u = createMockUpdater("available", { sleep: instant });
    await u.check();
    const events: UpdateProgress[] = [];
    await u.install((p) => events.push(p));

    const downloads = events.filter((e) => e.phase === "downloading");
    expect(downloads.length).toBeGreaterThan(1);
    const sizes = downloads.map((e) => e.downloaded);
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    expect(new Set(sizes).size).toBe(sizes.length);
    const phases = events.map((e) => e.phase);
    expect(phases.indexOf("installing")).toBeGreaterThan(
      phases.lastIndexOf("downloading"),
    );
    expect(phases.indexOf("restarting")).toBeGreaterThan(
      phases.indexOf("installing"),
    );
    expect(phases[phases.length - 1]).toBe("restarting");
  });

  it("実際のインストールや再起動は行われない", async () => {
    const u = createMockUpdater("available", { sleep: instant });
    await u.check();
    await u.install(() => {});
    expect(check).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("slow-progressは通常より多い段数で通知される", async () => {
    const count = async (kind: MockUpdaterKind) => {
      const u = createMockUpdater(kind, { sleep: instant });
      let n = 0;
      await u.install((p) => {
        if (p.phase === "downloading") n++;
      });
      return n;
    };
    expect(await count("slow-progress")).toBeGreaterThan(
      await count("available"),
    );
  });

  it("モック種別がinstall-errorのとき更新の適用が失敗する", async () => {
    const u = createMockUpdater("install-error", { sleep: instant });
    await u.check();
    const events: UpdateProgress[] = [];
    await expect(u.install((p) => events.push(p))).rejects.toThrow();
    expect(events.some((e) => e.phase === "restarting")).toBe(false);
  });
});

describe("モック種別の解釈", () => {
  it.each([
    "available",
    "none",
    "check-error",
    "install-error",
    "slow-progress",
  ])("既知の種別 %s はそのまま返す", (kind) => {
    expect(parseMockUpdaterKind(kind)).toBe(kind);
  });

  it.each(["unknown", "", undefined])("未知の値 %s は null になる", (value) => {
    expect(parseMockUpdaterKind(value)).toBeNull();
  });
});
