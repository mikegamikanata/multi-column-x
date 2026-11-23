import { invoke } from "@tauri-apps/api/core";
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAccounts } from "@/hooks/useAccounts";
import { usePendingDataDirectoryCleanup } from "@/hooks/usePendingDataDirectoryCleanup";
import { useAppStore } from "@/store/useAppStore";
import { DEFAULT_COLUMN_SETTINGS } from "@/types";
import type { Column } from "@/types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

const mockInvoke = vi.mocked(invoke);

const EXTERNAL_DIR = "/app/external_columns/column-col-gone";
const ACCOUNT_DIR = "/app/accounts/account-old";

function makeExternalColumn(id: string): Column {
  return {
    id,
    accountId: id,
    pageType: "external",
    width: 350,
    order: 0,
    gridRow: 1,
    gridCol: 1,
    heightMode: "auto",
    settings: DEFAULT_COLUMN_SETTINGS,
  };
}

function setPending(dirs: string[]) {
  useAppStore.setState({
    globalSettings: {
      ...useAppStore.getState().globalSettings,
      pendingDataDirectoryDeletions: dirs,
    },
  });
}

function deleteCalls() {
  return mockInvoke.mock.calls.filter((c) => c[0] === "delete_account_data");
}

function pending() {
  return useAppStore.getState().globalSettings.pendingDataDirectoryDeletions;
}

function renderCleanup(initialReady: boolean) {
  return renderHook(
    ({ ready }: { ready: boolean }) => {
      const { retryPendingDataDirectoryDeletions } = useAccounts();
      usePendingDataDirectoryCleanup(ready, retryPendingDataDirectoryDeletions);
    },
    { initialProps: { ready: initialReady } },
  );
}

describe("usePendingDataDirectoryCleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);
    useAppStore.setState({
      accounts: [],
      columns: [],
      isMobile: false,
      restoreInProgress: false,
    });
    setPending([]);
  });

  it("カラム復元完了後に削除予定のデータフォルダを削除して予定から外す", async () => {
    setPending([EXTERNAL_DIR]);
    renderCleanup(true);

    await act(async () => {});

    expect(mockInvoke).toHaveBeenCalledWith("delete_account_data", {
      dataDirectory: EXTERNAL_DIR,
    });
    expect(pending()).toEqual([]);
  });

  it("アカウント削除で残ったデータフォルダも起動時に削除して予定から外す", async () => {
    setPending([ACCOUNT_DIR]);
    renderCleanup(true);

    await act(async () => {});

    expect(mockInvoke).toHaveBeenCalledWith("delete_account_data", {
      dataDirectory: ACCOUNT_DIR,
    });
    expect(pending()).toEqual([]);
  });

  it("起動時に削除できなかったデータフォルダは削除予定に残る", async () => {
    setPending([EXTERNAL_DIR, ACCOUNT_DIR]);
    mockInvoke.mockImplementation(async (_cmd, args) => {
      if ((args as { dataDirectory: string }).dataDirectory === EXTERNAL_DIR) {
        throw new Error("locked");
      }
      return undefined;
    });
    renderCleanup(true);

    await act(async () => {});

    expect(pending()).toEqual([EXTERNAL_DIR]);
  });

  it("現在使われている外部サイトカラムのフォルダは削除せず予定から外す", async () => {
    const activeDir = "/app/external_columns/column-col-live";
    useAppStore.setState({ columns: [makeExternalColumn("col-live")] });
    setPending([activeDir]);
    renderCleanup(true);

    await act(async () => {});

    expect(mockInvoke).not.toHaveBeenCalledWith(
      "delete_account_data",
      expect.anything(),
    );
    expect(pending()).toEqual([]);
  });

  it("復元完了前は実行しない", async () => {
    setPending([EXTERNAL_DIR]);
    const { rerender } = renderCleanup(false);

    await act(async () => {});
    expect(deleteCalls()).toHaveLength(0);
    expect(pending()).toEqual([EXTERNAL_DIR]);

    rerender({ ready: true });
    await act(async () => {});
    expect(deleteCalls()).toHaveLength(1);
    expect(pending()).toEqual([]);
  });

  it("起動中に1回だけ実行する", async () => {
    setPending([EXTERNAL_DIR]);
    const { rerender } = renderCleanup(true);
    await act(async () => {});
    expect(deleteCalls()).toHaveLength(1);

    setPending([ACCOUNT_DIR]);
    rerender({ ready: true });
    rerender({ ready: false });
    rerender({ ready: true });
    await act(async () => {});

    expect(deleteCalls()).toHaveLength(1);
  });

  it("バックアップ復元中は実行しない", async () => {
    setPending([EXTERNAL_DIR]);
    useAppStore.setState({ restoreInProgress: true });
    renderCleanup(true);

    await act(async () => {});

    expect(deleteCalls()).toHaveLength(0);
    expect(pending()).toEqual([EXTERNAL_DIR]);
  });
});
