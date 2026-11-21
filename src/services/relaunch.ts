import { invoke } from "@tauri-apps/api/core";
import { IPC_COMMANDS } from "@/constants/ipc";

/**
 * アプリ独自の再起動処理（Rust の `relaunch_app`）を要求する。
 * AppImage では旧マウントの環境・fd を引き継がないよう整理してから起動し直す。
 */
export function requestAppRelaunch(): Promise<void> {
  return invoke<void>(IPC_COMMANDS.RELAUNCH_APP);
}
