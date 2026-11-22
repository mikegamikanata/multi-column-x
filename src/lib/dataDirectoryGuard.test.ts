import { describe, expect, it } from "vitest";
import { isActiveDataDirectory } from "@/lib/dataDirectoryGuard";
import { DEFAULT_COLUMN_SETTINGS } from "@/types";
import type { Account, Column } from "@/types";

function makeColumn(id: string, pageType: Column["pageType"]): Column {
  return {
    id,
    accountId: id,
    pageType,
    width: 350,
    order: 0,
    gridRow: 1,
    gridCol: 1,
    heightMode: "auto",
    settings: DEFAULT_COLUMN_SETTINGS,
  };
}

const accounts: Account[] = [
  {
    id: "acc-1",
    label: "A",
    dataDirectory: "/data/accounts/account-1",
    color: "#e0245e",
    createdAt: "2026-01-01T00:00:00Z",
  },
];

describe("isActiveDataDirectory", () => {
  it("登録中アカウントのdataDirectoryと一致すれば使用中と判定する", () => {
    expect(
      isActiveDataDirectory("/data/accounts/account-1", accounts, []),
    ).toBe(true);
  });

  it("存在する外部カラムのフォルダはスラッシュ区切りで使用中と判定する", () => {
    const columns = [makeColumn("ext-1", "external")];
    expect(
      isActiveDataDirectory(
        "/data/external_columns/column-ext-1",
        accounts,
        columns,
      ),
    ).toBe(true);
  });

  it("存在する外部カラムのフォルダはバックスラッシュ区切りでも使用中と判定する", () => {
    const columns = [makeColumn("ext-1", "external")];
    expect(
      isActiveDataDirectory(
        "C:\\data\\external_columns\\column-ext-1",
        accounts,
        columns,
      ),
    ).toBe(true);
  });

  it("削除済みカラムのフォルダは使用中と判定しない", () => {
    const columns = [makeColumn("ext-2", "external")];
    expect(
      isActiveDataDirectory(
        "/data/external_columns/column-ext-1",
        accounts,
        columns,
      ),
    ).toBe(false);
  });

  it("外部以外のカラムIDと同名のフォルダは使用中と判定しない", () => {
    const columns = [makeColumn("home-1", "home")];
    expect(
      isActiveDataDirectory(
        "/data/external_columns/column-home-1",
        accounts,
        columns,
      ),
    ).toBe(false);
  });

  it("どのアカウントにも一致しないパスは使用中と判定しない", () => {
    expect(isActiveDataDirectory("/data/accounts/other", accounts, [])).toBe(
      false,
    );
  });
});
