import type { AppUpdate, Updater, UpdateProgressCallback } from "./updater";

/** バンドルに混入していないことを確認するための目印文字列。 */
export const MOCK_MARKER = "mcx-updater-mock";

export type MockUpdaterKind =
  "available" | "none" | "check-error" | "install-error" | "slow-progress";

const KINDS: readonly MockUpdaterKind[] = [
  "available",
  "none",
  "check-error",
  "install-error",
  "slow-progress",
];

const MOCK_VERSION = "9.9.9";
const MOCK_TOTAL_BYTES = 10_000_000;
const CHECK_DELAY_MS = 300;

/** 環境変数の値をモック種別へ変換する。未知の値・空は null。 */
export function parseMockUpdaterKind(
  value: string | undefined,
): MockUpdaterKind | null {
  return KINDS.find((k) => k === value) ?? null;
}

interface MockDeps {
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 実際のダウンロード・インストール・再起動を行わない偽の Updater を作る。 */
export function createMockUpdater(
  kind: MockUpdaterKind,
  deps: MockDeps = {},
): Updater {
  const sleep = deps.sleep ?? realSleep;
  const slow = kind === "slow-progress";
  const steps = slow ? 20 : 5;
  const stepMs = slow ? 1000 : 200;
  return {
    async check(): Promise<AppUpdate | null> {
      await sleep(CHECK_DELAY_MS);
      if (kind === "none") return null;
      if (kind === "check-error") throw new Error("mock check failed");
      return {
        version: MOCK_VERSION,
        notes: `[${MOCK_MARKER}] Mock update for UI testing. Nothing is installed.`,
      };
    },
    async install(onProgress?: UpdateProgressCallback) {
      for (let i = 1; i <= steps; i++) {
        await sleep(stepMs);
        onProgress?.({
          phase: "downloading",
          downloaded: Math.round((MOCK_TOTAL_BYTES * i) / steps),
          total: MOCK_TOTAL_BYTES,
        });
        if (kind === "install-error" && i === 2) {
          throw new Error("mock install failed");
        }
      }
      onProgress?.({ phase: "installing" });
      await sleep(stepMs);
      onProgress?.({ phase: "restarting" });
    },
  };
}
