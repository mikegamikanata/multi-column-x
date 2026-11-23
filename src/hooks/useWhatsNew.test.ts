import { getVersion } from "@tauri-apps/api/app";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWhatsNewSelection } from "@/lib/githubRelease";
import { logError } from "@/lib/log";
import { useWhatsNew } from "./useWhatsNew";

vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn() }));
vi.mock("@/lib/githubRelease", () => ({ fetchWhatsNewSelection: vi.fn() }));
vi.mock("@/lib/log", () => ({ logError: vi.fn(() => vi.fn()) }));

describe("useWhatsNew", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("前回起動時のバージョンが記録されていない初回起動では表示しない: selectionはnull、fetchWhatsNewSelectionは呼ばれない、lastSeenにcurrentが記録される", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    const { result } = renderHook(() => useWhatsNew());
    await waitFor(() =>
      expect(localStorage.getItem("mcx_lastSeenVersion")).toBe("1.0.0"),
    );
    expect(result.current.selection).toBeNull();
    expect(fetchWhatsNewSelection).not.toHaveBeenCalled();
  });

  it("更新内容の確認が終わると今回のバージョンが前回起動時のバージョンとして記録される: selectionに取得結果がセットされる", async () => {
    localStorage.setItem("mcx_lastSeenVersion", "0.9.0");
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    const selection = {
      entries: [
        { version: "1.0.0", notes: "## What's New\n- Feature A" },
        { version: "0.9.5", notes: "- Fix B" },
      ],
      hasMore: true,
    };
    vi.mocked(fetchWhatsNewSelection).mockResolvedValue(selection);
    const { result } = renderHook(() => useWhatsNew());
    await waitFor(() => expect(result.current.selection).toEqual(selection));
    expect(fetchWhatsNewSelection).toHaveBeenCalledWith("0.9.0", "1.0.0");
    expect(localStorage.getItem("mcx_lastSeenVersion")).toBe("1.0.0");
  });

  it("リリースの一覧を取得できないとき更新内容ダイアログを表示しない: 取得結果がnullならselectionはnullのままlastSeenは更新される", async () => {
    localStorage.setItem("mcx_lastSeenVersion", "0.9.0");
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(fetchWhatsNewSelection).mockResolvedValue(null);
    const { result } = renderHook(() => useWhatsNew());
    await waitFor(() =>
      expect(localStorage.getItem("mcx_lastSeenVersion")).toBe("1.0.0"),
    );
    expect(result.current.selection).toBeNull();
  });

  it("取得に失敗しても今回のバージョンは前回起動時のバージョンとして記録される: 例外はログに記録されselectionはnullのまま", async () => {
    localStorage.setItem("mcx_lastSeenVersion", "0.9.0");
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(fetchWhatsNewSelection).mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useWhatsNew());
    await waitFor(() =>
      expect(localStorage.getItem("mcx_lastSeenVersion")).toBe("1.0.0"),
    );
    expect(result.current.selection).toBeNull();
    expect(logError).toHaveBeenCalledWith("useWhatsNew:check");
  });

  it("範囲内に本文のあるリリースが1件も無いとき更新内容ダイアログを表示しない: entriesが空ならselectionはnullのまま", async () => {
    localStorage.setItem("mcx_lastSeenVersion", "0.9.0");
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(fetchWhatsNewSelection).mockResolvedValue({
      entries: [],
      hasMore: false,
    });
    const { result } = renderHook(() => useWhatsNew());
    await waitFor(() =>
      expect(localStorage.getItem("mcx_lastSeenVersion")).toBe("1.0.0"),
    );
    expect(result.current.selection).toBeNull();
  });

  it("前回と今回のバージョンが同じとき表示しない: selectionはnull、fetchWhatsNewSelectionは呼ばれない", async () => {
    localStorage.setItem("mcx_lastSeenVersion", "1.0.0");
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    const { result } = renderHook(() => useWhatsNew());
    await waitFor(() => expect(getVersion).toHaveBeenCalledOnce());
    // micro-task chain の完了を待つ
    await act(async () => {});
    expect(result.current.selection).toBeNull();
    expect(fetchWhatsNewSelection).not.toHaveBeenCalled();
  });

  it("ready=falseの間はgetVersionも実行されない（何もしない）", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    const { result } = renderHook(
      ({ ready }: { ready: boolean }) => useWhatsNew(ready),
      { initialProps: { ready: false } },
    );
    await Promise.resolve();
    expect(getVersion).not.toHaveBeenCalled();
    expect(result.current.selection).toBeNull();
  });

  it("dismissでselectionがnullになる", async () => {
    localStorage.setItem("mcx_lastSeenVersion", "0.9.0");
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    const selection = {
      entries: [{ version: "1.0.0", notes: "## What's New\n- Feature A" }],
      hasMore: false,
    };
    vi.mocked(fetchWhatsNewSelection).mockResolvedValue(selection);
    const { result } = renderHook(() => useWhatsNew());
    await waitFor(() => expect(result.current.selection).toEqual(selection));
    act(() => result.current.dismiss());
    expect(result.current.selection).toBeNull();
  });
});
