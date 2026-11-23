import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

describe("UnsavedChangesDialog", () => {
  it("未適用の変更の確認を開くと編集に戻るボタンにフォーカスが当たる", () => {
    render(<UnsavedChangesDialog onDiscard={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByRole("button", { name: "戻る" })).toHaveFocus();
  });

  it("Escapeを押すと編集に戻る", () => {
    const onBack = vi.fn();
    const onDiscard = vi.fn();
    render(<UnsavedChangesDialog onDiscard={onDiscard} onBack={onBack} />);
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    expect(onBack).toHaveBeenCalledOnce();
    expect(onDiscard).not.toHaveBeenCalled();
  });
});
