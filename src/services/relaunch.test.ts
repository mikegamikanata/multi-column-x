import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IPC_COMMANDS } from "@/constants/ipc";
import { requestAppRelaunch } from "./relaunch";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("requestAppRelaunch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("再起動要求はrelaunch_appコマンドを引数なしで1回呼ぶ", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await requestAppRelaunch();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("relaunch_app");
    expect(IPC_COMMANDS.RELAUNCH_APP).toBe("relaunch_app");
  });

  it("コマンドが失敗した場合はその理由で拒否される", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("拒否"));
    await expect(requestAppRelaunch()).rejects.toThrow("拒否");
  });
});
