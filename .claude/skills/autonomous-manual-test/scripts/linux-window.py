#!/usr/bin/env python3
"""X11（XWayland）上のアプリ窓の一覧・移動・正常終了（外部モジュールなし。xwininfo と libX11 を ctypes で使う）。

  使い方: linux-window.py <コマンド>
    info                    主窓とカラム窓の ID / 座標 / サイズを出す
    close                   主窓だけに WM_DELETE_WINDOW を送る（正常終了の要求。窓の「閉じる」と同じ）
    move <x> <y>            主窓を移動する（XMoveWindow）
    resize <w> <h>          主窓のサイズを変える（XResizeWindow。L-11 のウィンドウ幅変更用）
    id                      主窓の ID（16 進）だけを出す

  GDK_BACKEND=x11 で起動したアプリが対象。主窓は WM_CLASS が "multicolumnx" でタイトルが "MultiColumnX" の窓、
  カラム窓はタイトル "Tauri App" の独立窓。mutter のフレーム窓（mutter-x11-frames）は対象外。
  Wayland ネイティブ起動のアプリには使えない（窓が見つからず exit 1）。
"""
import ctypes
import re
import subprocess
import sys

LINE = re.compile(
    r'^\s+(0x[0-9a-f]+) "([^"]*)": \("([^"]*)" "([^"]*)"\)\s+(\d+)x(\d+)\+(-?\d+)\+(-?\d+)\s+\+(-?\d+)\+(-?\d+)'
)


def windows():
    out = subprocess.run(["xwininfo", "-root", "-tree"], capture_output=True, text=True, check=True).stdout
    res = []
    for line in out.splitlines():
        m = LINE.match(line)
        if not m or m.group(3) != "multicolumnx":
            continue
        wid, title, _, _, w, h, _, _, ax, ay = m.groups()
        res.append({"id": wid, "title": title, "w": int(w), "h": int(h), "x": int(ax), "y": int(ay)})
    return res


def main_window():
    mains = [w for w in windows() if w["title"] == "MultiColumnX"]
    if len(mains) != 1:
        sys.exit("主窓が %d 個見つかった（GDK_BACKEND=x11 で起動したか）" % len(mains))
    return mains[0]


def xlib():
    x = ctypes.cdll.LoadLibrary("libX11.so.6")
    x.XOpenDisplay.restype = ctypes.c_void_p
    x.XOpenDisplay.argtypes = [ctypes.c_char_p]
    x.XInternAtom.restype = ctypes.c_ulong
    x.XInternAtom.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int]
    x.XSendEvent.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_long, ctypes.c_void_p]
    x.XMoveWindow.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_int]
    x.XResizeWindow.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_uint, ctypes.c_uint]
    x.XSync.argtypes = [ctypes.c_void_p, ctypes.c_int]
    d = x.XOpenDisplay(None)
    if not d:
        sys.exit("X ディスプレイに接続できない")
    return x, d


class CM(ctypes.Structure):
    _fields_ = [
        ("type", ctypes.c_int), ("serial", ctypes.c_ulong), ("send_event", ctypes.c_int),
        ("display", ctypes.c_void_p), ("window", ctypes.c_ulong), ("message_type", ctypes.c_ulong),
        ("format", ctypes.c_int), ("l", ctypes.c_long * 5),
    ]


class EV(ctypes.Union):
    _fields_ = [("cm", CM), ("pad", ctypes.c_long * 24)]



def main():
    args = sys.argv[1:]
    cmd = args[0] if args else ""
    if cmd == "info":
        ws = windows()
        if not ws:
            sys.exit("アプリの窓が見つからない")
        for w in ws:
            kind = {"MultiColumnX": "main  ", "Tauri App": "column"}.get(w["title"], "other ")
            print("%s id=%s title=%r pos=%d,%d size=%dx%d" % (kind, w["id"], w["title"], w["x"], w["y"], w["w"], w["h"]))
    elif cmd == "id":
        print(main_window()["id"])
    elif cmd == "close":
        w = int(main_window()["id"], 16)
        x, d = xlib()
        ev = EV()
        ev.cm.type = 33  # ClientMessage
        ev.cm.window = w
        ev.cm.format = 32
        ev.cm.message_type = x.XInternAtom(d, b"WM_PROTOCOLS", 0)
        ev.cm.l[0] = x.XInternAtom(d, b"WM_DELETE_WINDOW", 0)
        ev.cm.l[1] = 0
        ok = x.XSendEvent(d, w, 0, 0, ctypes.byref(ev))
        x.XSync(d, 0)
        print("sent WM_DELETE_WINDOW to %s (status=%d)" % (hex(w), ok))
    elif cmd in ("move", "resize") and len(args) == 3:
        w = int(main_window()["id"], 16)
        x, d = xlib()
        a, b = int(args[1]), int(args[2])
        if cmd == "move":
            x.XMoveWindow(d, w, a, b)
        else:
            x.XResizeWindow(d, w, a, b)
        x.XSync(d, 0)
        print("%s %s %d %d" % (cmd, hex(w), a, b))
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
