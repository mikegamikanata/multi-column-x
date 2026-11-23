#!/usr/bin/env python3
"""GTK ネイティブ保存ダイアログの操作（AT-SPI。python3 の gi.repository.Atspi を使う。外部モジュールなし）。Windows の win-dialog.ps1 に相当。

  使い方: linux-dialog.py <コマンド>
    info              ダイアログの有無（あれば `DIALOG <タイトル>`、無ければ `NODIALOG` で exit 1）
    dump              ダイアログのウィジェットツリー（ロール・名前・値）
    name              既定のファイル名（「名前」欄の値）
    save <フルパス>    「名前」欄にフルパスを入れて保存ボタンを押す（親ディレクトリは存在すること）
    cancel            キャンセルボタンを押す

  アプリ（プロセス名 multicolumnx）の AT-SPI ツリーにある role=file chooser のウィンドウを対象にする。
  OS のアクセシビリティ設定（gsettings の toolkit-accessibility）は変更しない。セッション環境に GTK_MODULES=gail:atk-bridge
  がある環境では、設定を変えなくてもアプリが AT-SPI に現れる（Ubuntu 26.04 / GNOME で確認。他環境は未確認）。
  ボタン名は UI 言語依存（ja: 保存(S) / キャンセル(C)、en: Save / Cancel）。WebView 内の DOM は AT-SPI に出ない（wk.cjs を使う）。
"""
import re
import sys

import gi

gi.require_version("Atspi", "2.0")
from gi.repository import Atspi  # noqa: E402

SAVE = re.compile(r"^(保存|Save)")
CANCEL = re.compile(r"^(キャンセル|Cancel)")


def find_dialog():
    desk = Atspi.get_desktop(0)
    for i in range(desk.get_child_count()):
        app = desk.get_child_at_index(i)
        if app is None or app.get_name() != "multicolumnx":
            continue
        for j in range(app.get_child_count()):
            w = app.get_child_at_index(j)
            if w is not None and w.get_role_name() == "file chooser":
                return w
    return None


def walk(o, depth=0):
    yield o, depth
    for k in range(o.get_child_count()):
        c = o.get_child_at_index(k)
        if c is not None:
            yield from walk(c, depth + 1)


def name_entry(dlg):
    """「名前」欄（label が 名前 / Name の兄弟にある text）を返す。"""
    for o, _ in walk(dlg):
        if o.get_role_name() != "filler" or o.get_child_count() < 2:
            continue
        kids = [o.get_child_at_index(k) for k in range(o.get_child_count())]
        if any(c is not None and c.get_role_name() == "label" and re.match(r"^(名前|Name)", c.get_name() or "") for c in kids):
            for c in kids:
                if c is not None and c.get_role_name() == "text":
                    return c
    return None


def text_of(o):
    t = o.get_text_iface() if hasattr(o, "get_text_iface") else None
    if t is None:
        return ""
    return Atspi.Text.get_text(t, 0, Atspi.Text.get_character_count(t))


def press(dlg, pattern):
    for o, _ in walk(dlg):
        if o.get_role_name() == "button" and pattern.match(o.get_name() or ""):
            Atspi.Action.do_action(o.get_action_iface(), 0)
            return True
    return False


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    dlg = find_dialog()
    if cmd == "info":
        if dlg is None:
            print("NODIALOG")
            sys.exit(1)
        print("DIALOG", dlg.get_name())
        return
    if dlg is None:
        print("NODIALOG")
        sys.exit(1)
    if cmd == "dump":
        for o, d in walk(dlg):
            extra = ""
            if o.get_role_name() == "text":
                extra = " value=%r" % text_of(o)
            print("  " * d + "%s %r%s" % (o.get_role_name(), o.get_name(), extra))
    elif cmd == "name":
        e = name_entry(dlg)
        print(text_of(e) if e is not None else "")
    elif cmd == "save" and len(sys.argv) == 3:
        e = name_entry(dlg)
        if e is None:
            sys.exit("「名前」欄が見つからない")
        Atspi.EditableText.set_text_contents(e.get_editable_text_iface(), sys.argv[2])
        if not press(dlg, SAVE):
            sys.exit("保存ボタンが見つからない")
        print("saved ->", sys.argv[2])
    elif cmd == "cancel":
        if not press(dlg, CANCEL):
            sys.exit("キャンセルボタンが見つからない")
        print("canceled")
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
