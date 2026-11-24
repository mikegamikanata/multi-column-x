import type { Meta, StoryObj } from "@storybook/react-vite";
import { composeStories } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, fn } from "storybook/test";
import * as AccountManagerStories from "@/components/AccountManager/AccountManager.stories";
import * as AccountNameDialogStories from "@/components/AccountNameDialog/AccountNameDialog.stories";
import * as AddColumnDialogStories from "@/components/AddColumnDialog/AddColumnDialog.stories";
import * as AppSettingsPanelStories from "@/components/AppSettingsPanel/AppSettingsPanel.stories";
import { ConfirmDialog } from "@/components/ConfirmDialog/ConfirmDialog";
import * as ConfirmDialogStories from "@/components/ConfirmDialog/ConfirmDialog.stories";
import * as H264SetupDialogStories from "@/components/H264SetupDialog/H264SetupDialog.stories";
import * as LinkPopupDialogStories from "@/components/LinkPopupDialog/LinkPopupDialog.stories";
import * as SettingsPanelStories from "@/components/SettingsPanel/SettingsPanel.stories";
import * as ShortcutHelpDialogStories from "@/components/ShortcutHelpDialog/ShortcutHelpDialog.stories";
import * as TabActionDialogStories from "@/components/TabActionDialog/TabActionDialog.stories";
import * as UpdateDialogStories from "@/components/UpdateDialog/UpdateDialog.stories";
import * as WhatsNewDialogStories from "@/components/WhatsNewDialog/WhatsNewDialog.stories";
import { installThemeTokens } from "@/test-utils/storyTheme";
import { setPlatform } from "@/test-utils/tapTargets";
import { ModalDialog } from "./ModalDialog";

// ---- 描画する 12 ダイアログ（各ダイアログの既存 Story の args・decorators をそのまま使う） ----

const { Default: AccountManager } = composeStories(AccountManagerStories);
const { Default: AccountNameDialog } = composeStories(AccountNameDialogStories);
const { Default: AddColumnDialog } = composeStories(AddColumnDialogStories);
const { Default: AppSettingsPanel } = composeStories(AppSettingsPanelStories);
const { Default: ConfirmDialogDefault } = composeStories(ConfirmDialogStories);
const { Idle: H264SetupDialog } = composeStories(H264SetupDialogStories);
const { Default: LinkPopupDialog } = composeStories(LinkPopupDialogStories);
const { Default: SettingsPanel } = composeStories(SettingsPanelStories);
const { Default: ShortcutHelpDialog } = composeStories(
  ShortcutHelpDialogStories,
);
const { Default: TabActionDialog } = composeStories(TabActionDialogStories);
const { Default: UpdateDialog, Downloading: UpdateDialogInstalling } =
  composeStories(UpdateDialogStories);
const { ThreeEntries: WhatsNewDialog } = composeStories(WhatsNewDialogStories);

interface DialogCase {
  name: string;
  render: () => ReactNode;
}

const ALL_DIALOGS: DialogCase[] = [
  { name: "AccountManager", render: () => <AccountManager /> },
  { name: "AccountNameDialog", render: () => <AccountNameDialog /> },
  { name: "AddColumnDialog", render: () => <AddColumnDialog /> },
  { name: "AppSettingsPanel", render: () => <AppSettingsPanel /> },
  { name: "ConfirmDialog", render: () => <ConfirmDialogDefault /> },
  { name: "H264SetupDialog", render: () => <H264SetupDialog /> },
  { name: "LinkPopupDialog", render: () => <LinkPopupDialog /> },
  { name: "SettingsPanel", render: () => <SettingsPanel /> },
  { name: "ShortcutHelpDialog", render: () => <ShortcutHelpDialog /> },
  { name: "TabActionDialog", render: () => <TabActionDialog /> },
  { name: "UpdateDialog", render: () => <UpdateDialog /> },
  { name: "WhatsNewDialog", render: () => <WhatsNewDialog /> },
];

// ---- 画面（背景のツールバー + ダイアログ）の組み立て ----

const BACKGROUND_BUTTON_1 = "背景ボタン1";
const BACKGROUND_BUTTON_2 = "背景ボタン2";

// 背後のアプリ画面（ツールバー）を模す。ダイアログの外に置く操作要素
function BackgroundToolbar({ onClick }: { onClick?: () => void }) {
  return (
    <div
      style={{
        position: "fixed",
        top: "0.5rem",
        left: "0.5rem",
        display: "flex",
        gap: "0.5rem",
      }}
    >
      <button type="button" onClick={onClick}>
        {BACKGROUND_BUTTON_1}
      </button>
      <button type="button" onClick={onClick}>
        {BACKGROUND_BUTTON_2}
      </button>
    </div>
  );
}

interface Screen {
  /** 最前面（外側）の <dialog> */
  dialog: HTMLDialogElement;
  backgroundButtons: HTMLButtonElement[];
  unmount: () => void;
}

/** 背景ツールバーとダイアログを描画して開く。unmount で DOM ごと片付ける */
function mountScreen(
  canvasElement: HTMLElement,
  dialogNode: ReactNode,
  onBackgroundClick?: () => void,
): Screen {
  installThemeTokens();
  // 直前の画面のフォーカスを持ち越さない（ダイアログの初期フォーカスの検証を安定させる）
  (document.activeElement as HTMLElement | null)?.blur();
  const container = document.createElement("div");
  canvasElement.appendChild(container);
  const root = createRoot(container);
  flushSync(() => {
    root.render(
      <>
        <BackgroundToolbar onClick={onBackgroundClick} />
        {dialogNode}
      </>,
    );
  });
  const dialog = container.querySelector("dialog");
  if (!dialog) throw new Error("dialog 要素が描画されていません");
  const backgroundButtons = Array.from(
    container.querySelectorAll<HTMLButtonElement>(":scope > div > button"),
  );
  return {
    dialog,
    backgroundButtons,
    unmount: () => {
      flushSync(() => root.unmount());
      container.remove();
    },
  };
}

/** 非同期の初期描画（遅延読み込み・副作用）が落ち着くのを待つ */
async function settle(): Promise<void> {
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
  await new Promise<void>((resolve) => setTimeout(resolve, 50));
}

// ---- 実キー入力（vitest/browser。Storybook 画面上では動かないので null を返す） ----

type KeyboardUser = { keyboard: (keys: string) => Promise<unknown> };

async function loadKeyboardUser(): Promise<KeyboardUser | null> {
  try {
    const { userEvent } = await import("vitest/browser");
    return userEvent;
  } catch {
    return null;
  }
}

const TAB = "{Tab}";
const SHIFT_TAB = "{Shift>}{Tab}{/Shift}";

// ---- Tab 巡回の検査に使う要素の列挙 ----

const TABBABLE_SELECTOR =
  "a[href], button, input:not([type=hidden]), select, textarea, summary, [tabindex], [contenteditable]";

/** ダイアログ自身に属する、Tab で到達できる要素を文書順で返す（入れ子の別ダイアログ内は除く） */
function tabbablesOf(dialog: HTMLElement): HTMLElement[] {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR),
  ).filter(
    (el) =>
      !el.matches(":disabled") &&
      el.tabIndex >= 0 &&
      el.closest("dialog") === dialog &&
      el.checkVisibility({ visibilityProperty: true }),
  );
}

function describeElement(el: Element | null): string {
  if (!el) return "(null)";
  if (el === document.body) return "<body>";
  const text = (el.textContent ?? "").trim().slice(0, 20);
  const aria = el.getAttribute("aria-label");
  return `<${el.tagName.toLowerCase()}${aria ? ` aria-label="${aria}"` : ""}>${text}`;
}

/** 失敗時にどのダイアログか分かるよう、ダイアログごとに検査して失敗をまとめて投げる */
async function checkEachDialog(
  canvasElement: HTMLElement,
  cases: DialogCase[],
  check: (screen: Screen, name: string) => Promise<void>,
): Promise<void> {
  const failures: string[] = [];
  for (const { name, render } of cases) {
    const screen = mountScreen(canvasElement, render());
    try {
      await settle();
      await check(screen, name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`[${name}] ${message}`);
    } finally {
      screen.unmount();
    }
  }
  if (failures.length > 0) throw new Error(failures.join("\n"));
}

function expectOk(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

// ---- 重なりの検査用ハーネス ----

// 外側の <dialog>（下のダイアログ）の中に確認ダイアログを入れ子で開く。アプリ設定の未適用確認と同じ構造
function StackedHarness() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <ModalDialog aria-label="下のダイアログ" onEscape={fn()}>
      <button type="button">下の操作1</button>
      <button type="button" onClick={() => setConfirmOpen(true)}>
        確認を開く
      </button>
      <button type="button">下の操作3</button>
      {confirmOpen && (
        <ConfirmDialog
          title="確認"
          message="よろしいですか？"
          confirmLabel="はい"
          cancelLabel="いいえ"
          onConfirm={() => setConfirmOpen(false)}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </ModalDialog>
  );
}

// 兄弟として並べて開く。後から開いた（showModal を呼んだ）方が最前面になる
function SiblingHarness() {
  return (
    <>
      <ConfirmDialog
        title="先に開いた"
        message="下になるダイアログ"
        confirmLabel="下はい"
        cancelLabel="下いいえ"
        onConfirm={fn()}
        onCancel={fn()}
      />
      <ConfirmDialog
        title="後から開いた"
        message="最前面になるダイアログ"
        confirmLabel="上はい"
        cancelLabel="上いいえ"
        onConfirm={fn()}
        onCancel={fn()}
      />
    </>
  );
}

// ---- 見た目の検査 ----

function parseAlpha(color: string): number {
  if (color === "transparent") return 0;
  const match = /rgba?\(([^)]+)\)/.exec(color);
  if (!match) throw new Error(`色を解釈できません: ${color}`);
  const parts = match[1].split(/[,/\s]+/).filter(Boolean);
  return parts.length >= 4 ? Number(parts[3]) : 1;
}

function expectCoversViewport(el: HTMLElement, label: string): void {
  const rect = el.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;
  expectOk(
    Math.abs(rect.left) <= 1 &&
      Math.abs(rect.top) <= 1 &&
      Math.abs(rect.width - viewportWidth) <= 1 &&
      Math.abs(rect.height - viewportHeight) <= 1,
    `${label} が画面全体を覆っていません: left=${rect.left} top=${rect.top} ${rect.width}x${rect.height}（画面 ${viewportWidth}x${viewportHeight}）`,
  );
}

function expectNoBorder(el: HTMLElement, label: string): void {
  const style = getComputedStyle(el);
  const widths = [
    style.borderTopWidth,
    style.borderRightWidth,
    style.borderBottomWidth,
    style.borderLeftWidth,
  ];
  expectOk(
    widths.every((w) => parseFloat(w) === 0),
    `${label} に枠線があります: ${widths.join(" ")}`,
  );
}

const meta: Meta = {
  title: "Components/ModalDialog",
  parameters: { layout: "fullscreen" },
  render: () => <div />,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const TabWrapsToFirstOnAllDialogs: Story = {
  name: "全ダイアログ・最後の操作要素で Tab を押すと最初の操作要素へ戻りツールバーへ出ない",
  play: async ({ canvasElement }) => {
    const user = await loadKeyboardUser();
    if (!user) return;
    await checkEachDialog(canvasElement, ALL_DIALOGS, async (screen) => {
      const items = tabbablesOf(screen.dialog);
      expectOk(items.length > 0, "ダイアログ内に操作要素がありません");
      const first = items[0];
      const last = items[items.length - 1];
      last.focus();
      expectOk(
        document.activeElement === last,
        `最後の操作要素にフォーカスできません: ${describeElement(last)}`,
      );
      await user.keyboard(TAB);
      const active = document.activeElement;
      expectOk(
        active === first,
        `Tab 後のフォーカスが最初の操作要素ではありません: 期待 ${describeElement(first)} / 実際 ${describeElement(active)}`,
      );
      expectOk(
        !screen.backgroundButtons.includes(active as HTMLButtonElement),
        "Tab でツールバーのボタンへフォーカスが出ました",
      );
    });
  },
};

export const ShiftTabWrapsToLastOnAllDialogs: Story = {
  name: "全ダイアログ・最初の操作要素で Shift+Tab を押すと最後の操作要素へ移りツールバーへ出ない",
  play: async ({ canvasElement }) => {
    const user = await loadKeyboardUser();
    if (!user) return;
    await checkEachDialog(canvasElement, ALL_DIALOGS, async (screen) => {
      const items = tabbablesOf(screen.dialog);
      expectOk(items.length > 0, "ダイアログ内に操作要素がありません");
      const first = items[0];
      const last = items[items.length - 1];
      first.focus();
      expectOk(
        document.activeElement === first,
        `最初の操作要素にフォーカスできません: ${describeElement(first)}`,
      );
      await user.keyboard(SHIFT_TAB);
      const active = document.activeElement;
      expectOk(
        active === last,
        `Shift+Tab 後のフォーカスが最後の操作要素ではありません: 期待 ${describeElement(last)} / 実際 ${describeElement(active)}`,
      );
      expectOk(
        !screen.backgroundButtons.includes(active as HTMLButtonElement),
        "Shift+Tab でツールバーのボタンへフォーカスが出ました",
      );
    });
  },
};

export const TabCycleStaysInsideAllDialogs: Story = {
  name: "全ダイアログ・Tab を繰り返してもフォーカスはダイアログ内だけを一周する",
  play: async ({ canvasElement }) => {
    const user = await loadKeyboardUser();
    if (!user) return;
    await checkEachDialog(canvasElement, ALL_DIALOGS, async (screen) => {
      const items = tabbablesOf(screen.dialog);
      expectOk(items.length > 0, "ダイアログ内に操作要素がありません");
      const first = items[0];
      first.focus();
      const visited: Element[] = [];
      let returned = false;
      // 一周に必要な回数 + 余裕。一周したら最初の要素へ戻る
      for (let i = 0; i < items.length + 2; i++) {
        await user.keyboard(TAB);
        const active = document.activeElement;
        expectOk(
          active !== null && screen.dialog.contains(active),
          `Tab ${i + 1} 回目でフォーカスがダイアログの外へ出ました: ${describeElement(active)}`,
        );
        visited.push(active as Element);
        if (active === first) {
          returned = true;
          break;
        }
      }
      expectOk(returned, "Tab を繰り返しても最初の操作要素へ戻りませんでした");
    });
  },
};

export const ShiftTabCycleStaysInsideAllDialogs: Story = {
  name: "全ダイアログ・Shift+Tab を繰り返してもフォーカスはダイアログ内だけを一周する",
  play: async ({ canvasElement }) => {
    const user = await loadKeyboardUser();
    if (!user) return;
    await checkEachDialog(canvasElement, ALL_DIALOGS, async (screen) => {
      const items = tabbablesOf(screen.dialog);
      expectOk(items.length > 0, "ダイアログ内に操作要素がありません");
      const last = items[items.length - 1];
      last.focus();
      let returned = false;
      for (let i = 0; i < items.length + 2; i++) {
        await user.keyboard(SHIFT_TAB);
        const active = document.activeElement;
        expectOk(
          active !== null && screen.dialog.contains(active),
          `Shift+Tab ${i + 1} 回目でフォーカスがダイアログの外へ出ました: ${describeElement(active)}`,
        );
        if (active === last) {
          returned = true;
          break;
        }
      }
      expectOk(
        returned,
        "Shift+Tab を繰り返しても最後の操作要素へ戻りませんでした",
      );
    });
  },
};

export const OutsideElementsAreNotClickable: Story = {
  name: "ダイアログの外の要素はクリックしても反応しない（カラム追加）",
  play: async ({ canvasElement }) => {
    const onBackgroundClick = fn();
    const screen = mountScreen(
      canvasElement,
      <AddColumnDialog />,
      onBackgroundClick,
    );
    try {
      await settle();
      for (const button of screen.backgroundButtons) {
        const rect = button.getBoundingClientRect();
        const hit = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        // 背景のボタンの位置にはダイアログ側（<dialog> かその内側）が最前面にある
        await expect(hit).not.toBeNull();
        await expect(hit).not.toBe(button);
        await expect(screen.dialog.contains(hit)).toBe(true);
      }
      await expect(onBackgroundClick).not.toHaveBeenCalled();
      await expect(screen.dialog.open).toBe(true);
      // 背景のボタンへはスクリプトからもフォーカスできない（背後は操作不能）
      screen.backgroundButtons[0].focus();
      await expect(document.activeElement).not.toBe(
        screen.backgroundButtons[0],
      );
    } finally {
      screen.unmount();
    }
  },
};

export const InstallingUpdateFocusesDialog: Story = {
  name: "更新のインストール中はダイアログ本体にフォーカスが当たりTabでも外へ出ない",
  play: async ({ canvasElement }) => {
    const user = await loadKeyboardUser();
    if (!user) return;
    const screen = mountScreen(canvasElement, <UpdateDialogInstalling />);
    try {
      await settle();
      const { dialog } = screen;
      await expect(tabbablesOf(dialog)).toHaveLength(0);
      await expect(document.activeElement).toBe(dialog);
      for (const keys of [TAB, TAB, SHIFT_TAB, SHIFT_TAB]) {
        await user.keyboard(keys);
        const active = document.activeElement;
        expectOk(
          active !== null && dialog.contains(active),
          `${keys} でフォーカスがダイアログの外へ出ました: ${describeElement(active)}`,
        );
        expectOk(
          !screen.backgroundButtons.includes(active as HTMLButtonElement),
          `${keys} でツールバーのボタンへフォーカスが出ました`,
        );
      }
    } finally {
      screen.unmount();
    }
  },
};

export const StackedDialogsTabInFrontOnly: Story = {
  name: "重なったダイアログでは最前面の確認ダイアログ内だけでTabが巡回し、閉じると下のダイアログ内で巡回する",
  play: async ({ canvasElement }) => {
    const user = await loadKeyboardUser();
    if (!user) return;
    const screen = mountScreen(canvasElement, <StackedHarness />);
    try {
      await settle();
      const lower = screen.dialog;
      const trigger = Array.from(lower.querySelectorAll("button")).find(
        (b) => b.textContent === "確認を開く",
      );
      if (!trigger) throw new Error("確認を開くボタンが見つかりません");
      const lowerButtons = Array.from(lower.querySelectorAll("button")).filter(
        (b) => b.closest("dialog") === lower,
      );

      // 下のダイアログの「確認を開く」へフォーカスして実キーで開く
      trigger.focus();
      await expect(document.activeElement).toBe(trigger);
      await user.keyboard("{Enter}");
      await settle();
      const confirm = lower.querySelector<HTMLDialogElement>("dialog");
      if (!confirm) throw new Error("確認ダイアログが開いていません");
      await expect(confirm.open).toBe(true);
      const confirmButtons = tabbablesOf(confirm);
      await expect(confirmButtons).toHaveLength(2);

      // 確認ダイアログ内だけで巡回する（前方向・後ろ方向とも）
      for (const keys of [
        TAB,
        TAB,
        TAB,
        TAB,
        SHIFT_TAB,
        SHIFT_TAB,
        SHIFT_TAB,
      ]) {
        await user.keyboard(keys);
        const active = document.activeElement;
        expectOk(
          active !== null && confirm.contains(active),
          `${keys} で確認ダイアログの外へフォーカスが出ました: ${describeElement(active)}`,
        );
        expectOk(
          !lowerButtons.includes(active as HTMLButtonElement),
          `${keys} で下のダイアログの要素へフォーカスが移りました: ${describeElement(active)}`,
        );
      }

      // 確認ダイアログを閉じる（Esc）→ 開く前にフォーカスしていた要素へ戻る
      await user.keyboard("{Escape}");
      await settle();
      await expect(lower.querySelector("dialog")).toBeNull();
      await expect(lower.open).toBe(true);
      await expect(document.activeElement).toBe(trigger);

      // 下のダイアログ内で巡回し、外へ出ない
      const lowerItems = tabbablesOf(lower);
      for (const keys of [
        TAB,
        TAB,
        TAB,
        TAB,
        SHIFT_TAB,
        SHIFT_TAB,
        SHIFT_TAB,
        SHIFT_TAB,
      ]) {
        await user.keyboard(keys);
        const active = document.activeElement;
        expectOk(
          active !== null && lower.contains(active),
          `${keys} で下のダイアログの外へフォーカスが出ました: ${describeElement(active)}`,
        );
        expectOk(
          lowerItems.includes(active as HTMLElement),
          `${keys} で想定外の要素へフォーカスが移りました: ${describeElement(active)}`,
        );
      }
    } finally {
      screen.unmount();
    }
  },
};

export const LaterOpenedDialogIsInFront: Story = {
  name: "2つのダイアログを続けて開くと後から開いた方が最前面になり下のものは操作できない",
  play: async ({ canvasElement }) => {
    const user = await loadKeyboardUser();
    if (!user) return;
    const screen = mountScreen(canvasElement, <SiblingHarness />);
    try {
      await settle();
      const dialogs = Array.from(
        canvasElement.querySelectorAll<HTMLDialogElement>("dialog"),
      );
      await expect(dialogs).toHaveLength(2);
      const [lower, upper] = dialogs;
      await expect(lower.open).toBe(true);
      await expect(upper.open).toBe(true);

      // 画面中央でヒットするのは後から開いた方
      const hit = document.elementFromPoint(
        document.documentElement.clientWidth / 2,
        document.documentElement.clientHeight / 2,
      );
      expectOk(
        hit !== null && upper.contains(hit) && !lower.contains(hit),
        `画面中央で最前面にあるのが後から開いたダイアログではありません: ${describeElement(hit)}`,
      );

      // 下のダイアログの要素へはフォーカスできない
      const lowerButton = lower.querySelector("button");
      lowerButton?.focus();
      await expect(document.activeElement).not.toBe(lowerButton);

      // Tab は最前面のダイアログ内だけを巡回する
      for (const keys of [TAB, TAB, TAB, SHIFT_TAB, SHIFT_TAB]) {
        await user.keyboard(keys);
        const active = document.activeElement;
        expectOk(
          active !== null && upper.contains(active),
          `${keys} で最前面のダイアログの外へフォーカスが出ました: ${describeElement(active)}`,
        );
      }
    } finally {
      screen.unmount();
    }
  },
};

// 暗い背景・標準の枠線や余白が出ないこと・パネルが中央にあることを実測する
const APPEARANCE_CASES: Array<{
  name: string;
  render: () => ReactNode;
  /** 自身の SCSS が padding を持たないダイアログは 0 を確認する */
  expectZeroPadding: boolean;
}> = [
  {
    name: "WhatsNewDialog",
    render: () => <WhatsNewDialog />,
    expectZeroPadding: true,
  },
  {
    name: "UpdateDialog",
    render: () => <UpdateDialog />,
    expectZeroPadding: true,
  },
  {
    name: "H264SetupDialog",
    render: () => <H264SetupDialog />,
    expectZeroPadding: true,
  },
  {
    name: "ConfirmDialog",
    render: () => <ConfirmDialogDefault />,
    expectZeroPadding: false,
  },
  {
    name: "ShortcutHelpDialog",
    render: () => <ShortcutHelpDialog />,
    expectZeroPadding: false,
  },
];

export const AppearanceIsUnchanged: Story = {
  name: "ダイアログの見た目は画面全体の暗い背景と中央のパネルのままで標準の枠線や余白が現れない",
  play: async ({ canvasElement }) => {
    const failures: string[] = [];
    for (const { name, render, expectZeroPadding } of APPEARANCE_CASES) {
      const screen = mountScreen(canvasElement, render());
      try {
        await settle();
        const { dialog } = screen;
        const style = getComputedStyle(dialog);
        expectCoversViewport(dialog, "ダイアログ");
        expectNoBorder(dialog, "ダイアログ");
        expectOk(
          parseFloat(style.marginTop) === 0 &&
            parseFloat(style.marginLeft) === 0,
          `ダイアログに標準の margin があります: ${style.margin}`,
        );
        if (expectZeroPadding) {
          expectOk(
            parseFloat(style.paddingTop) === 0 &&
              parseFloat(style.paddingLeft) === 0,
            `ダイアログに標準の padding があります: ${style.padding}`,
          );
        }
        expectOk(
          parseAlpha(style.backgroundColor) > 0,
          `暗い背景（半透明の色）がありません: ${style.backgroundColor}`,
        );
        const backdrop = getComputedStyle(dialog, "::backdrop");
        expectOk(
          parseAlpha(backdrop.backgroundColor) === 0,
          `標準の ::backdrop が透明になっていません: ${backdrop.backgroundColor}`,
        );
        const panel = dialog.firstElementChild as HTMLElement | null;
        expectOk(panel !== null, "パネル要素がありません");
        const panelRect = (panel as HTMLElement).getBoundingClientRect();
        const centerX = panelRect.left + panelRect.width / 2;
        const centerY = panelRect.top + panelRect.height / 2;
        expectOk(
          Math.abs(centerX - document.documentElement.clientWidth / 2) <= 2 &&
            Math.abs(centerY - document.documentElement.clientHeight / 2) <= 2,
          `パネルが画面中央にありません: 中心 (${centerX}, ${centerY})`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`[${name}] ${message}`);
      } finally {
        screen.unmount();
      }
    }
    if (failures.length > 0) throw new Error(failures.join("\n"));
  },
};

export const AndroidFullscreen: Story = {
  name: "Android ではアプリ設定が画面全体を覆い角丸と枠線がない",
  play: async ({ canvasElement }) => {
    const restorePlatform = setPlatform("android");
    const screen = mountScreen(canvasElement, <AppSettingsPanel />);
    try {
      await settle();
      const { dialog } = screen;
      expectCoversViewport(dialog, "ダイアログ");
      const panel = dialog.firstElementChild as HTMLElement | null;
      expectOk(panel !== null, "パネル要素がありません");
      const target = panel as HTMLElement;
      expectCoversViewport(target, "パネル");
      expectNoBorder(target, "パネル");
      const style = getComputedStyle(target);
      const radii = [
        style.borderTopLeftRadius,
        style.borderTopRightRadius,
        style.borderBottomLeftRadius,
        style.borderBottomRightRadius,
      ];
      expectOk(
        radii.every((r) => parseFloat(r) === 0),
        `パネルに角丸があります: ${radii.join(" ")}`,
      );
    } finally {
      screen.unmount();
      restorePlatform();
    }
  },
};
