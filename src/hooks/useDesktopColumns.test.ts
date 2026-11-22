import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { platform } from "@tauri-apps/plugin-os";
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { IPC_COMMANDS } from "../constants/ipc";
import { setRootFontPx } from "../lib/uiScale";
import { resolveColumnDataDirectory } from "../services/externalColumn";
import { useAppStore } from "../store/useAppStore";
import type { Account, Column } from "../types";
import { DEFAULT_COLUMN_SETTINGS, DEFAULT_GLOBAL_SETTINGS } from "../types";
import { desktopGridBounds, useDesktopColumns } from "./useDesktopColumns";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

// Linux のメインウィンドウ移動監視（onMoved）用。既定では呼び出し元テストに影響しないよう
// 未設定の vi.fn() を返し、platform() が "linux" のテストでのみ個別に実装を差し替える。
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(),
}));

// Linux 専用のウィンドウ移動追従 useEffect（platform() !== "linux" で早期 return）を
// 通過させるためのモック。ここでは Windows/Mac 相当の挙動のみを検証対象とする。
vi.mock("@tauri-apps/plugin-os", () => ({
  platform: vi.fn(() => "windows"),
}));

// resolveColumnDataDirectory は内部で invoke（IPC）を呼ぶため、実際の挙動を
// 模したデフォルト実装でモックする（既存アカウント検索ロジックのテストは維持しつつ、
// external カラムのテストではこのモックを上書きして解決済みパスを返させる）。
vi.mock("../services/externalColumn", () => ({
  isExternalColumn: vi.fn((column: Column) => column.pageType === "external"),
  resolveColumnDataDirectory: vi.fn(
    async (column: Column, accounts: Account[]) =>
      accounts.find((a) => a.id === column.accountId)?.dataDirectory,
  ),
}));

const mockInvoke = vi.mocked(invoke);
const mockResolveColumnDataDirectory = vi.mocked(resolveColumnDataDirectory);
const mockGetCurrentWindow = vi.mocked(getCurrentWindow);
const mockPlatform = vi.mocked(platform);

/** clientHeight を固定した div を持つ RefObject を作る（jsdom は clientHeight を計測しないため）。 */
function makeContainerRef(clientHeight: number) {
  const div = document.createElement("div");
  Object.defineProperty(div, "clientHeight", {
    value: clientHeight,
    configurable: true,
  });
  return { current: div };
}

/** scrollLeft を固定した div を持つ RefObject を作る。 */
function makeScrollbarRef(scrollLeft = 0) {
  const div = document.createElement("div");
  Object.defineProperty(div, "scrollLeft", {
    value: scrollLeft,
    configurable: true,
    writable: true,
  });
  return { current: div };
}

const account1 = {
  id: "acc-1",
  label: "Account1",
  dataDirectory: "/data/acc-1",
  color: "#1d9bf0",
  createdAt: "2026-01-01T00:00:00Z",
};

function makeColumn(
  overrides: Partial<Column> & Pick<Column, "id" | "gridCol">,
): Column {
  return {
    accountId: "acc-1",
    pageType: "home",
    homeTabName: "フォロー中",
    width: 350,
    order: overrides.gridCol - 1,
    gridRow: 1,
    heightMode: "auto",
    settings: { ...DEFAULT_COLUMN_SETTINGS },
    ...overrides,
  };
}

function renderDesktopColumns(opts?: {
  containerHeight?: number | null;
  dialogOpen?: boolean;
  activeColumnId?: string | null;
  setActiveColumn?: (id: string) => Promise<void>;
}) {
  const containerRef =
    opts?.containerHeight === null
      ? { current: null }
      : makeContainerRef(opts?.containerHeight ?? 900);
  const scrollbarRef = makeScrollbarRef(0);
  const dialogOpenRef = { current: opts?.dialogOpen ?? false };
  const rendered = renderHook(() =>
    useDesktopColumns({
      containerRef,
      scrollbarRef,
      dialogOpenRef,
      activeColumnId: opts?.activeColumnId ?? null,
      setActiveColumn:
        opts?.setActiveColumn ?? vi.fn().mockResolvedValue(undefined),
    }),
  );
  return { ...rendered, scrollbarRef };
}

/** resize_column_webview の invoke を手動で resolve / reject できるようにする。 */
interface ResizeDeferred {
  columnId: string;
  x: number;
  resolve: () => void;
  reject: (e: unknown) => void;
}

function controlResizeInvokes() {
  const pending: ResizeDeferred[] = [];
  const all: ResizeDeferred[] = [];
  mockInvoke.mockImplementation((cmd, args) => {
    if (cmd !== IPC_COMMANDS.RESIZE_COLUMN_WEBVIEW) return Promise.resolve();
    const { columnId, x } = (
      args as { bounds: { columnId: string; x: number } }
    ).bounds;
    return new Promise<void>((resolve, reject) => {
      const d: ResizeDeferred = {
        columnId,
        x,
        resolve: () => {
          pending.splice(pending.indexOf(d), 1);
          resolve();
        },
        reject: (e) => {
          pending.splice(pending.indexOf(d), 1);
          reject(e);
        },
      };
      pending.push(d);
      all.push(d);
    });
  });
  return { pending, all };
}

function setScrollLeft(ref: { current: HTMLDivElement | null }, v: number) {
  (ref.current as HTMLDivElement).scrollLeft = v;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useDesktopColumns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);
    mockResolveColumnDataDirectory.mockImplementation(
      async (column, accounts) =>
        accounts.find((a) => a.id === column.accountId)?.dataDirectory,
    );
    useAppStore.setState({
      accounts: [account1],
      columns: [
        makeColumn({ id: "col-1", gridCol: 1 }),
        makeColumn({ id: "col-2", gridCol: 2 }),
      ],
      globalSettings: { ...DEFAULT_GLOBAL_SETTINGS },
      isLoaded: true,
      isMobile: false,
      topBarExpanded: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ウィンドウリサイズは100msデバウンス後に全カラムを再配置する", () => {
    vi.useFakeTimers();
    renderDesktopColumns();
    mockInvoke.mockClear();

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    act(() => {
      vi.advanceTimersByTime(50);
    });
    // 50ms 時点ではまだデバウンス中のため再配置されない
    expect(
      mockInvoke.mock.calls.filter(
        (c) => c[0] === IPC_COMMANDS.RESIZE_COLUMN_WEBVIEW,
      ),
    ).toHaveLength(0);

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    act(() => {
      vi.advanceTimersByTime(50);
    });
    // 2回目のイベントでタイマーがリセットされるため、まだ100ms経過していない
    expect(
      mockInvoke.mock.calls.filter(
        (c) => c[0] === IPC_COMMANDS.RESIZE_COLUMN_WEBVIEW,
      ),
    ).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(50);
    });
    // 2回目のイベントから100ms経過したので、両カラムが再配置される
    const resizeCalls = mockInvoke.mock.calls.filter(
      (c) => c[0] === IPC_COMMANDS.RESIZE_COLUMN_WEBVIEW,
    );
    expect(resizeCalls).toHaveLength(2);
  });

  it("ダイアログ表示中のウィンドウリサイズでは再配置しない", () => {
    vi.useFakeTimers();
    renderDesktopColumns({ dialogOpen: true });
    mockInvoke.mockClear();

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("スクロールバー操作は1フレームに1回だけ再配置する", () => {
    // CLAUDE.md「Linux WebProcess クラッシュ対策」の予防層のデグレ検知が目的。
    // 横スクロールで resize_column_webview（Linux では WebviewWindow 再配置）が
    // 連続発火すると WebKitGTK の WebProcess が高負荷でクラッシュしうるため、
    // rafThrottle により 1 フレームに 1 回へ間引く仕様をここで固定する。
    vi.useFakeTimers();
    const { result } = renderDesktopColumns();
    mockInvoke.mockClear();

    act(() => {
      result.current.handleScrollbarScroll();
      result.current.handleScrollbarScroll();
      result.current.handleScrollbarScroll();
    });

    // rAF が発火するまでは再配置されない
    expect(mockInvoke).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersToNextFrame();
    });

    const resizeCalls = mockInvoke.mock.calls.filter(
      (c) => c[0] === IPC_COMMANDS.RESIZE_COLUMN_WEBVIEW,
    );
    // 3回スクロールイベントを発火させても、rAFで1フレームに集約されるため
    // 再配置はカラム数分（2）のみ。間引きが壊れると 3 倍（6回）になる。
    expect(resizeCalls).toHaveLength(2);
  });

  it("デスクトップで全カラムを再配置するとスクロール位置を考慮したx座標になる", async () => {
    const containerRef = makeContainerRef(900);
    const scrollbarRef = makeScrollbarRef(50);
    const { result } = renderHook(() =>
      useDesktopColumns({
        containerRef,
        scrollbarRef,
        dialogOpenRef: { current: false },
        activeColumnId: null,
        setActiveColumn: vi.fn().mockResolvedValue(undefined),
      }),
    );
    mockInvoke.mockClear();

    await act(async () => {
      await result.current.recalculateAllBounds();
    });

    const col1Resize = mockInvoke.mock.calls.find(
      (c) =>
        c[0] === IPC_COMMANDS.RESIZE_COLUMN_WEBVIEW &&
        (c[1] as { bounds: { columnId: string; x: number } }).bounds
          .columnId === "col-1",
    );
    expect(col1Resize).toBeDefined();
    // col-1 は gridCol=1 のため xOffset=0。scrollLeft(50) を引いた x になる
    expect((col1Resize?.[1] as { bounds: { x: number } }).bounds.x).toBe(-50);
  });

  it("restoreDesktopColumnsはカラムごとにWebViewを作成し最後に全体を再配置する", async () => {
    const { result } = renderDesktopColumns();
    const columns = [
      makeColumn({ id: "col-1", gridCol: 1 }),
      makeColumn({ id: "col-2", gridCol: 2 }),
    ];

    await act(async () => {
      await result.current.restoreDesktopColumns(
        columns,
        [account1],
        900,
        0,
        32,
      );
    });

    const commandSequence = mockInvoke.mock.calls.map((c) => c[0]);
    const createCalls = commandSequence.filter(
      (cmd) => cmd === IPC_COMMANDS.CREATE_COLUMN_WEBVIEW,
    );
    expect(createCalls).toHaveLength(2);

    const lastCreateIdx = commandSequence.lastIndexOf(
      IPC_COMMANDS.CREATE_COLUMN_WEBVIEW,
    );
    const firstResizeIdx = commandSequence.indexOf(
      IPC_COMMANDS.RESIZE_COLUMN_WEBVIEW,
    );
    // 全カラム作成後に recalculateAllBounds による再配置が続く
    expect(firstResizeIdx).toBeGreaterThan(lastCreateIdx);
  });

  it("アカウントが見つからないカラムはWebViewを作成しない", async () => {
    const { result } = renderDesktopColumns();
    const orphanColumn = makeColumn({
      id: "col-orphan",
      gridCol: 1,
      accountId: "acc-missing",
    });

    await act(async () => {
      await result.current.restoreDesktopColumns(
        [orphanColumn],
        [account1],
        900,
        0,
        32,
      );
    });

    expect(
      mockInvoke.mock.calls.filter(
        (c) => c[0] === IPC_COMMANDS.CREATE_COLUMN_WEBVIEW,
      ),
    ).toHaveLength(0);
  });

  it("restoreDesktopColumnsはexternalカラムをアカウントなしでもcreateColumnWebviewを呼び出す", async () => {
    const externalColumn = makeColumn({
      id: "col-external",
      gridCol: 1,
      pageType: "external",
      accountId: "col-external",
    });
    mockResolveColumnDataDirectory.mockImplementation(async (column) =>
      column.id === "col-external" ? "/data/external/col-external" : undefined,
    );
    const { result } = renderDesktopColumns();

    await act(async () => {
      await result.current.restoreDesktopColumns(
        [externalColumn],
        [],
        900,
        0,
        32,
      );
    });

    const createCall = mockInvoke.mock.calls.find(
      (c) => c[0] === IPC_COMMANDS.CREATE_COLUMN_WEBVIEW,
    );
    expect(createCall).toBeDefined();
    expect(
      (createCall?.[1] as { args: { dataDirectory: string } }).args
        .dataDirectory,
    ).toBe("/data/external/col-external");
  });
});

describe("useDesktopColumns（Linux: メインウィンドウ移動監視）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);
    mockResolveColumnDataDirectory.mockImplementation(
      async (column, accounts) =>
        accounts.find((a) => a.id === column.accountId)?.dataDirectory,
    );
    useAppStore.setState({
      accounts: [account1],
      columns: [makeColumn({ id: "col-1", gridCol: 1 })],
      globalSettings: { ...DEFAULT_GLOBAL_SETTINGS },
      isLoaded: true,
      isMobile: false,
      topBarExpanded: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("監視の登録完了前に解除されたときも、登録が完了した時点で監視は解除される", async () => {
    mockPlatform.mockReturnValueOnce("linux");
    const unlistenFn = vi.fn();
    let resolveOnMoved!: (fn: () => void) => void;
    const onMovedPromise = new Promise<() => void>((resolve) => {
      resolveOnMoved = resolve;
    });
    mockGetCurrentWindow.mockReturnValue({
      onMoved: vi.fn().mockReturnValue(onMovedPromise),
    } as unknown as ReturnType<typeof getCurrentWindow>);

    const { unmount } = renderDesktopColumns();

    // 登録（onMoved の Promise）が解決する前にクリーンアップが走る
    unmount();
    expect(unlistenFn).not.toHaveBeenCalled();

    // 登録が完了した時点で解除関数が呼ばれること
    await act(async () => {
      resolveOnMoved(unlistenFn);
      await onMovedPromise;
    });

    expect(unlistenFn).toHaveBeenCalledTimes(1);
  });

  it("登録完了後に不要になったときは監視が解除される", async () => {
    mockPlatform.mockReturnValueOnce("linux");
    const unlistenFn = vi.fn();
    const onMovedPromise = Promise.resolve(unlistenFn);
    mockGetCurrentWindow.mockReturnValue({
      onMoved: vi.fn().mockReturnValue(onMovedPromise),
    } as unknown as ReturnType<typeof getCurrentWindow>);

    const { unmount } = renderDesktopColumns();

    // 登録完了（onMoved の Promise 解決）を待ってからアンマウントする
    await act(async () => {
      await onMovedPromise;
    });

    unmount();
    // cleanup 内の unlistenPromise.then(...) はマイクロタスクなので1tick待つ
    await act(async () => {
      await Promise.resolve();
    });

    expect(unlistenFn).toHaveBeenCalledTimes(1);
  });
});

describe("useDesktopColumns（再配置の直列化）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({
      accounts: [account1],
      columns: [
        makeColumn({ id: "col-1", gridCol: 1 }),
        makeColumn({ id: "col-2", gridCol: 2 }),
      ],
      globalSettings: { ...DEFAULT_GLOBAL_SETTINGS },
      isLoaded: true,
      isMobile: false,
      topBarExpanded: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("再配置の実行中に次の要求が来たときは完了後に最新の状態で1回だけ再配置する", async () => {
    const ctl = controlResizeInvokes();
    const { result, scrollbarRef } = renderDesktopColumns();

    act(() => {
      void result.current.recalculateAllBounds();
    });
    expect(ctl.all).toHaveLength(2);

    setScrollLeft(scrollbarRef, 10);
    act(() => {
      void result.current.recalculateAllBounds();
    });
    setScrollLeft(scrollbarRef, 20);
    act(() => {
      void result.current.recalculateAllBounds();
    });
    setScrollLeft(scrollbarRef, 30);
    act(() => {
      void result.current.recalculateAllBounds();
    });
    // 実行中は次の再配置が始まらない
    expect(ctl.all).toHaveLength(2);

    await act(async () => {
      ctl.pending.slice().forEach((d) => d.resolve());
    });
    await flush();

    // 完了後にもう 1 回だけ（カラム数分）、最後の scrollLeft で計算される
    expect(ctl.all).toHaveLength(4);
    expect(ctl.all[2].columnId).toBe("col-1");
    expect(ctl.all[2].x).toBe(-30);
    await act(async () => {
      ctl.pending.slice().forEach((d) => d.resolve());
    });
    await flush();
    expect(ctl.all).toHaveLength(4);
  });

  it("再配置が同時に複数走ることはない", async () => {
    const ctl = controlResizeInvokes();
    const { result } = renderDesktopColumns();

    for (let i = 0; i < 5; i++) {
      act(() => {
        void result.current.recalculateAllBounds();
      });
      expect(ctl.pending.length).toBeLessThanOrEqual(2);
    }
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        ctl.pending.slice().forEach((d) => d.resolve());
      });
      await flush();
      expect(ctl.pending.length).toBeLessThanOrEqual(2);
    }
  });

  it("横スクロールを止めたときの最終配置は最後のスクロール位置に対応する", async () => {
    vi.useFakeTimers();
    const ctl = controlResizeInvokes();
    const { result, scrollbarRef } = renderDesktopColumns();

    for (const left of [40, 90, 15, 60, 25]) {
      setScrollLeft(scrollbarRef, left);
      act(() => {
        result.current.handleScrollbarScroll();
      });
      act(() => {
        vi.advanceTimersToNextFrame();
      });
      // 一部の invoke だけ解決して、完了順が入れ替わる状況を作る
      await act(async () => {
        ctl.pending[0]?.resolve();
      });
    }
    // 保留中の再配置も含め、すべて完了するまで解決し続ける
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        ctl.pending.slice().forEach((d) => d.resolve());
      });
      await flush();
    }

    const lastCol1 = ctl.all.filter((d) => d.columnId === "col-1").pop();
    expect(lastCol1?.x).toBe(-25);
  });

  it("再配置の完了を待つ操作は自分の要求以降の状態が反映されるまで待たされる", async () => {
    const ctl = controlResizeInvokes();
    const { result } = renderDesktopColumns();

    act(() => {
      void result.current.recalculateAllBounds();
    });
    expect(ctl.all).toHaveLength(2);

    act(() => {
      useAppStore.setState({
        columns: [
          makeColumn({ id: "col-1", gridCol: 1 }),
          makeColumn({ id: "col-2", gridCol: 2 }),
          makeColumn({ id: "col-3", gridCol: 3 }),
        ],
      });
    });
    let settled = false;
    act(() => {
      void result.current.recalculateAllBounds().then(() => {
        settled = true;
      });
    });

    // 1 回目（追加前の状態）が終わっただけでは待ちは終わらない
    await act(async () => {
      ctl.pending.slice().forEach((d) => d.resolve());
    });
    await flush();
    expect(settled).toBe(false);
    expect(ctl.all).toHaveLength(5);
    expect(ctl.all.slice(2).map((d) => d.columnId)).toContain("col-3");

    // 追加後の状態で計算した再配置が完了したときに決着する
    await act(async () => {
      ctl.pending.slice().forEach((d) => d.resolve());
    });
    await flush();
    expect(settled).toBe(true);
  });

  it("1つの再配置が失敗しても後続の再配置は行われる", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const ctl = controlResizeInvokes();
    const { result, scrollbarRef } = renderDesktopColumns();

    act(() => {
      void result.current.recalculateAllBounds();
    });
    setScrollLeft(scrollbarRef, 70);
    act(() => {
      void result.current.recalculateAllBounds();
    });
    expect(ctl.all).toHaveLength(2);

    await act(async () => {
      ctl.pending.slice().forEach((d) => d.reject(new Error("失敗")));
    });
    await flush();

    expect(ctl.all).toHaveLength(4);
    expect(ctl.all[2].x).toBe(-70);
  });

  it("画面を閉じた後は保留中の再配置を行わない", async () => {
    const ctl = controlResizeInvokes();
    const { result, unmount } = renderDesktopColumns();

    act(() => {
      void result.current.recalculateAllBounds();
    });
    act(() => {
      void result.current.recalculateAllBounds();
    });
    expect(ctl.all).toHaveLength(2);

    unmount();
    await act(async () => {
      ctl.pending.slice().forEach((d) => d.resolve());
    });
    await flush();

    expect(ctl.all).toHaveLength(2);
  });
});

describe("desktopGridBounds（UI倍率の反映）", () => {
  afterEach(() => {
    setRootFontPx(16);
  });

  const viewport = {
    containerHeight: 800,
    scrollLeft: 0,
    topBarHeight: 32,
  };

  it("倍率1.0ではヘッダー高さ36pxぶん下げた位置にカラムが配置される", () => {
    const bounds = desktopGridBounds(
      [makeColumn({ id: "c1", gridCol: 1 })],
      viewport,
    );
    expect(bounds.c1.y).toBe(32 + 36);
  });

  it("倍率1.25ではヘッダー高さ45pxぶん下げた位置にカラムが配置される", () => {
    setRootFontPx(20);
    const bounds = desktopGridBounds([makeColumn({ id: "c1", gridCol: 1 })], {
      ...viewport,
      topBarHeight: 40,
    });
    expect(bounds.c1.y).toBe(40 + 45);
  });
});
