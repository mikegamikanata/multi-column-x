import { openUrl } from "@tauri-apps/plugin-opener";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RELEASES_PAGE_URL } from "@/lib/githubRelease";
import { openReleasePage } from "./releasePage";

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

describe("リリースページのURL", () => {
  it("このアプリのGitHubリリース一覧ページのURLである", () => {
    expect(RELEASES_PAGE_URL).toBe(
      "https://github.com/natsuyasai/multi-column-x/releases",
    );
  });
});

describe("openReleasePage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("リリース一覧ページのURLだけを1つの引数で1回だけ開く", async () => {
    vi.mocked(openUrl).mockResolvedValue(undefined);
    await openReleasePage();
    expect(openUrl).toHaveBeenCalledTimes(1);
    expect(vi.mocked(openUrl).mock.calls[0]).toEqual([RELEASES_PAGE_URL]);
  });

  it("開くURLを引数で受け取らない", () => {
    expect(openReleasePage.length).toBe(0);
  });

  it("ブラウザを開けなかった場合はその理由で拒否される", async () => {
    vi.mocked(openUrl).mockRejectedValue(new Error("開けない"));
    await expect(openReleasePage()).rejects.toThrow("開けない");
  });
});
