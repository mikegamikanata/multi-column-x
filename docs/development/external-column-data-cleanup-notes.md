# 外部サイトカラムのデータフォルダ削除（再試行・削除予定・起動時削除）

## 背景

Windows の WebView2 は WebView 破棄直後もブラウザプロセスがデータフォルダ（`<app_data>/external_columns/column-<id>`、Cookie 等を含む）を掴んでおり、1回の `remove_dir_all` では消せないことがあった。消えないとログイン情報が残る。

## 流れ

1. `handleRemoveColumn`（`src/hooks/useColumns.ts`）が WebView 破棄後に `deleteExternalColumnData` を呼ぶ（外部サイトカラムのみ。それ以外のカラムではアカウントのデータを消さない）。
2. Rust `delete_external_column_data` が `delete_external_dir_with_retry` で最大5回・200ms 間隔（`DELETE_RETRY_MAX_ATTEMPTS` / `DELETE_RETRY_INTERVAL`、アカウント削除と共通。最大約0.8秒）再試行する。
3. 消せなければ `Some(path)` を返し、TS が既存の `pendingDataDirectoryDeletions` に登録する。消せれば `None`（元から無い場合も `None`）。
4. 起動時（カラム復元完了後に1回）`usePendingDataDirectoryCleanup` が `retryPendingDataDirectoryDeletions` を自動実行し、削除できた分を予定から外す。失敗分は予定に残る（次回起動または設定画面の手動再実行で再試行）。

## 許可パス（セキュリティ）

保留の再実行は `delete_account_data` にパス文字列を渡すため、Rust 側 `is_safe_deletable_data_dir` で次のみ許可する。

- `<app_data>/accounts` 配下（ルート自体は不可）
- `<app_data>/external_columns/column-<安全なID>`（`is_external_column_data_dir`。`..` を含むパス、深い階層、prefix 無し、`parent()` が `external_columns` でないものは拒否）

許可範囲を広げる場合は、拒否パターンのテスト（`account.rs` / `column.rs`）を必ず足すこと。

## 使用中ガード

再実行時、登録中アカウントの `dataDirectory`、または現存する外部サイトカラム（`column-<id>`）のフォルダと一致するパスは、削除せず予定から外す（`src/lib/dataDirectoryGuard.ts`）。

## 挙動変更

起動時の自動削除は、外部カラム由来だけでなく、アカウント削除で消せずに保留になっていた分も対象にする（従来は設定画面の手動再実行のみ）。バックアップ対象外であることは変わらない。

## 不採用案

- TS 側ループ再試行: タイマーのモックが必要でテストが複雑、IPC 往復が増える。
- 外部カラム ID 用の新フィールド: Rust / TS / `contracts/default-settings.json` の3点同期やバックアップ除外などの変更が大きく、UI も二重化する。
- Rust `setup` での起動時削除: 保留リストは TS ストア（`appSettings`）が所有しており、Rust から書くと保存と競合する。

## 注意

- Windows の大文字小文字・UNC 表記差で `parent()` 比較が一致しないパスは削除されず保留に残る（安全側）。
- 復元中（`restoreInProgress`）は起動時削除を実行しない。
