import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppUpdater } from "@/hooks/useAppUpdater";
import { UpdateDialog } from "./UpdateDialog";

vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const Harness: React.FC = () => {
  const u = useAppUpdater(false, true);
  if (!u.available) return null;
  return (
    <UpdateDialog
      update={u.available}
      installing={u.installing}
      progress={u.progress}
      installError={u.installError}
      onInstall={u.install}
      onLater={u.dismiss}
    />
  );
};

describe("モック更新ありで起動したとき", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("VITE_UPDATER_MOCK", "available");
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("更新ダイアログが表示され適用でダウンロード進捗が表示される", async () => {
    render(<Harness />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(screen.getByText(/9\.9\.9/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "更新する" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(450);
    });
    expect(screen.getByText(/ダウンロード中.*\d+%/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });
});
