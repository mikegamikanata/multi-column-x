import { getVersion } from "@tauri-apps/api/app";
import { error as pluginError } from "@tauri-apps/plugin-log";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WhatsNewDialog } from "@/components/WhatsNewDialog/WhatsNewDialog";
import { STORAGE_KEYS } from "@/constants/ipc";
import i18n from "@/i18n";
import { RELEASES_PAGE_URL } from "@/lib/githubRelease";
import { logError } from "@/lib/log";
import { openReleasePage } from "@/services/releasePage";
import { expectNoJapanese } from "@/test-utils/japanese";
import { useWhatsNew } from "./useWhatsNew";

vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.mock("@tauri-apps/plugin-log", () => ({ error: vi.fn() }));

const LINK_NAME = "リリースページで過去の変更内容を確認する";
const MORE_NOTE =
  "これより前のバージョンの変更内容は、リリースページで確認できます。";

interface RawRelease {
  tag_name: string;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
}

function release(
  tag: string,
  body: string | null,
  options: { draft?: boolean; prerelease?: boolean } = {},
): RawRelease {
  return {
    tag_name: tag,
    body,
    draft: options.draft ?? false,
    prerelease: options.prerelease ?? false,
  };
}

/** バージョンごとに識別できる日本語の本文を作る */
function jaBody(version: string): string {
  return `### 新機能\n- ${version}の新機能`;
}

/** 英語表示のテスト用（リリース本文は日本語のままのため英語の文字列を使う） */
function enBody(version: string): string {
  return `### New features\n- New in ${version}`;
}

/** App.tsx と同じ配線で hook とダイアログを結合するハーネス */
function Harness() {
  const { selection, dismiss } = useWhatsNew(true);
  if (!selection) return null;
  return (
    <WhatsNewDialog
      entries={selection.entries}
      hasMore={selection.hasMore}
      onOpenReleasePage={() => {
        openReleasePage().catch(logError("test:openReleasePage"));
      }}
      onClose={dismiss}
    />
  );
}

const fetchMock = vi.fn();

function respondWithReleases(releases: RawRelease[]) {
  fetchMock.mockResolvedValue({ ok: true, json: async () => releases });
}

function setup(lastSeen: string | null, current: string) {
  if (lastSeen !== null) {
    localStorage.setItem(STORAGE_KEYS.LAST_SEEN_VERSION, lastSeen);
  }
  vi.mocked(getVersion).mockResolvedValue(current);
}

function lastSeen(): string | null {
  return localStorage.getItem(STORAGE_KEYS.LAST_SEEN_VERSION);
}

/** 今回のバージョンの記録は確認処理の最後に行われるため、処理完了の合図になる */
async function waitForCheckFinished(current: string) {
  await waitFor(() => expect(lastSeen()).toBe(current));
}

function versionHeadings(): (string | null)[] {
  return screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
}

describe("更新後ダイアログの結合（useWhatsNew + githubRelease + WhatsNewDialog + openReleasePage）", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(openUrl).mockResolvedValue(undefined);
    vi.mocked(pluginError).mockResolvedValue(undefined);
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("前回から今回までの間に複数のバージョンがあるとき新しい順に並べて表示する", async () => {
    setup("0.8.0", "0.9.1");
    // API 応答は順不同
    respondWithReleases([
      release("v0.9.0", jaBody("0.9.0")),
      release("v0.8.1", jaBody("0.8.1")),
      release("v0.9.1", jaBody("0.9.1")),
    ]);

    render(<Harness />);

    await screen.findByRole("dialog");
    expect(versionHeadings()).toEqual([
      "バージョン 0.9.1",
      "バージョン 0.9.0",
      "バージョン 0.8.1",
    ]);
    expect(
      screen.getAllByRole("heading", { level: 4, name: "新機能" }),
    ).toHaveLength(3);
    expect(screen.getByText("0.9.1の新機能")).toBeInTheDocument();
    expect(screen.getByText("0.9.0の新機能")).toBeInTheDocument();
    expect(screen.getByText("0.8.1の新機能")).toBeInTheDocument();
  });

  it("範囲内のバージョンが4件以上あるとき最新から3件だけ表示し省略の注記を出す", async () => {
    setup("0.5.0", "0.9.1");
    respondWithReleases([
      release("v0.6.0", jaBody("0.6.0")),
      release("v0.8.0", jaBody("0.8.0")),
      release("v0.8.1", jaBody("0.8.1")),
      release("v0.9.0", jaBody("0.9.0")),
      release("v0.9.1", jaBody("0.9.1")),
    ]);

    render(<Harness />);

    await screen.findByRole("dialog");
    expect(versionHeadings()).toEqual([
      "バージョン 0.9.1",
      "バージョン 0.9.0",
      "バージョン 0.8.1",
    ]);
    expect(screen.queryByText("バージョン 0.8.0")).not.toBeInTheDocument();
    expect(screen.queryByText("バージョン 0.6.0")).not.toBeInTheDocument();
    expect(screen.getByText(MORE_NOTE)).toBeInTheDocument();
  });

  it("範囲内のバージョンが3件以下のとき省略の注記は表示しない", async () => {
    setup("0.8.0", "0.9.1");
    respondWithReleases([
      release("v0.9.1", jaBody("0.9.1")),
      release("v0.9.0", jaBody("0.9.0")),
      release("v0.8.1", jaBody("0.8.1")),
    ]);

    render(<Harness />);

    await screen.findByRole("dialog");
    expect(versionHeadings()).toHaveLength(3);
    expect(screen.queryByText(MORE_NOTE)).not.toBeInTheDocument();
  });

  it.each([
    ["1件のみ", "0.9.0", "0.9.1", ["v0.9.1"]],
    ["3件のみ", "0.8.0", "0.9.1", ["v0.8.1", "v0.9.0", "v0.9.1"]],
    [
      "4件以上",
      "0.5.0",
      "0.9.1",
      ["v0.6.0", "v0.8.0", "v0.8.1", "v0.9.0", "v0.9.1"],
    ],
  ])(
    "更新内容ダイアログにはリリースページへのリンクが常に表示される(%s)",
    async (_label, last, current, tags) => {
      setup(last, current);
      respondWithReleases(
        tags.map((tag) => release(tag, jaBody(tag.replace(/^v/, "")))),
      );

      render(<Harness />);

      await screen.findByRole("dialog");
      expect(screen.getByRole("link", { name: LINK_NAME })).toHaveAttribute(
        "href",
        "https://github.com/natsuyasai/multi-column-x/releases",
      );
      expect(RELEASES_PAGE_URL).toBe(
        "https://github.com/natsuyasai/multi-column-x/releases",
      );
    },
  );

  it("リンクを選ぶとリリースページが既定のブラウザで開かれる", async () => {
    setup("0.8.0", "0.9.1");
    respondWithReleases([release("v0.9.1", jaBody("0.9.1"))]);
    render(<Harness />);
    await screen.findByRole("dialog");

    // fireEvent.click は既定動作が阻止されなかったとき true を返す
    const notPrevented = fireEvent.click(
      screen.getByRole("link", { name: LINK_NAME }),
    );

    await waitFor(() => expect(openUrl).toHaveBeenCalledTimes(1));
    expect(openUrl).toHaveBeenCalledWith(
      "https://github.com/natsuyasai/multi-column-x/releases",
    );
    // WebView 内での遷移は起こさない
    expect(notPrevented).toBe(false);
    // ダイアログは表示されたまま
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("リンクを選んだときリリースページを開けなくてもダイアログは残り、エラーはログに記録される", async () => {
    setup("0.8.0", "0.9.1");
    respondWithReleases([release("v0.9.1", jaBody("0.9.1"))]);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.mocked(openUrl).mockRejectedValue(new Error("opener failed"));
    render(<Harness />);
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("link", { name: LINK_NAME }));

    await waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        "[test:openReleasePage] opener failed",
      ),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("更新内容ダイアログの閉じるを選ぶとダイアログが閉じる", async () => {
    setup("0.8.0", "0.9.1");
    respondWithReleases([release("v0.9.1", jaBody("0.9.1"))]);
    render(<Harness />);
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("更新内容ダイアログはEscapeキーでも閉じる", async () => {
    setup("0.8.0", "0.9.1");
    respondWithReleases([release("v0.9.1", jaBody("0.9.1"))]);
    render(<Harness />);
    await screen.findByRole("dialog");

    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  describe("表示言語", () => {
    afterEach(async () => {
      await i18n.changeLanguage("ja");
    });

    it("更新内容ダイアログの文言は表示言語に従う: 英語で4件以上のとき日本語が表示されない", async () => {
      await i18n.changeLanguage("en");
      setup("0.5.0", "0.9.1");
      respondWithReleases([
        release("v0.6.0", enBody("0.6.0")),
        release("v0.8.0", enBody("0.8.0")),
        release("v0.8.1", enBody("0.8.1")),
        release("v0.9.0", enBody("0.9.0")),
        release("v0.9.1", enBody("0.9.1")),
      ]);

      const { container } = render(<Harness />);

      await screen.findByRole("dialog");
      expectNoJapanese(container);
      expect(
        screen.getByRole("heading", { level: 3, name: "Version 0.9.1" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Changes in earlier versions are available on the release page.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", {
          name: "View past changes on the release page",
        }),
      ).toBeInTheDocument();
    });
  });

  describe("表示対象の選別", () => {
    it("下書き・プレリリース・本文が空のリリースは表示されず、本文が空のものは上限の3件に数えられない", async () => {
      setup("0.8.0", "0.9.1");
      respondWithReleases([
        release("v0.9.1", jaBody("0.9.1")),
        // 本文が空（空白のみ・null）
        release("v0.9.0", "  \n"),
        release("v0.8.9", null),
        // 下書き・プレリリース
        release("v0.8.8", jaBody("0.8.8"), { draft: true }),
        release("v0.8.7", jaBody("0.8.7"), { prerelease: true }),
        release("v0.8.3", jaBody("0.8.3")),
        release("v0.8.2", jaBody("0.8.2")),
        release("v0.8.1", jaBody("0.8.1")),
      ]);

      render(<Harness />);

      await screen.findByRole("dialog");
      // 本文が空のリリースが数えられていれば3件に満たない
      expect(versionHeadings()).toEqual([
        "バージョン 0.9.1",
        "バージョン 0.8.3",
        "バージョン 0.8.2",
      ]);
      // 適格なものは4件あるので省略の注記が出る
      expect(screen.getByText(MORE_NOTE)).toBeInTheDocument();
    });
  });

  describe("表示しない条件と記録", () => {
    it("リリースの一覧を取得できないとき(ok=false)ダイアログを表示せず、今回のバージョンが記録される", async () => {
      setup("0.8.0", "0.9.1");
      fetchMock.mockResolvedValue({ ok: false, json: async () => [] });

      render(<Harness />);

      await waitForCheckFinished("0.9.1");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("リリースの一覧の取得が失敗したとき(通信エラー)ダイアログを表示せず、今回のバージョンが記録される", async () => {
      setup("0.8.0", "0.9.1");
      vi.spyOn(console, "error").mockImplementation(() => {});
      fetchMock.mockRejectedValue(new Error("network"));

      render(<Harness />);

      await waitForCheckFinished("0.9.1");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("前回起動時のバージョンが記録されていない初回起動では取得せず表示しない", async () => {
      setup(null, "0.9.1");
      respondWithReleases([release("v0.9.1", jaBody("0.9.1"))]);

      render(<Harness />);

      await waitForCheckFinished("0.9.1");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("一度表示したあと次回起動では再表示されない: 今回のバージョンが記録され、再マウントしても取得せず表示しない", async () => {
      setup("0.8.0", "0.9.1");
      respondWithReleases([release("v0.9.1", jaBody("0.9.1"))]);

      const first = render(<Harness />);
      await screen.findByRole("dialog");
      await waitForCheckFinished("0.9.1");
      first.unmount();
      fetchMock.mockClear();

      render(<Harness />);
      await waitFor(() => expect(getVersion).toHaveBeenCalledTimes(2));
      // 非同期の確認処理が完了するまで待つ
      await act(async () => {});

      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
