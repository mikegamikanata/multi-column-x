#!/usr/bin/env bash
# Linux でアプリを WebKit リモートインスペクタ付きで起動する。
#   使い方: linux-launch.sh <AppImage またはバイナリ> [--wayland] [--pid-file <file>] [--log <file>]
#   既定は GDK_BACKEND=x11（XWayland。linux-window.py / xwininfo で窓を操作・正常終了できる）。
#   --wayland は GDK_BACKEND を設定せずに起動する。ただしアプリ本体（src-tauri/src/main.rs）が WAYLAND_DISPLAY を見て
#   GDK_BACKEND=x11 を自分で設定するため、現行ビルドでは Wayland セッションでも結局 XWayland で動く（実効は同じ。
#   起動後に表示する「主窓」の行で確認できる）。
#   環境変数: MCX_WK_PORT（インスペクタのポート。既定 9340）
#   起動した PID（AppImage の場合は起動したプロセスの PID）を標準出力の `PID=<n>` に出し、--pid-file にも書く。
#   WEBKIT_INSPECTOR_HTTP_SERVER は子プロセスにも引き継がれる（relaunch_app 後の新プロセスも同じポートを使おうとする）。
set -euo pipefail

port="${MCX_WK_PORT:-9340}"
backend=x11
pid_file=""
log_file=""
target=""
while [ $# -gt 0 ]; do
  case "$1" in
    --wayland) backend=wayland ;;
    --pid-file) pid_file="$2"; shift ;;
    --log) log_file="$2"; shift ;;
    -*) echo "不明なオプション: $1" >&2; exit 2 ;;
    *) target="$1" ;;
  esac
  shift
done
if [ -z "$target" ] || [ ! -x "$target" ]; then
  echo "usage: linux-launch.sh <AppImage またはバイナリ> [--wayland] [--pid-file <file>] [--log <file>]" >&2
  exit 2
fi
log_file="${log_file:-/tmp/mcx-launch-$$.log}"

# 起動前チェック: 二重起動の拒否、メモリ・/tmp 残骸の表示
if pgrep -x multicolumnx >/dev/null; then
  echo "multicolumnx が既に起動している（PID: $(pgrep -x multicolumnx | tr '\n' ' ')）。正常終了させてから起動する" >&2
  exit 1
fi
echo "--- free -h"
free -h
echo "--- /tmp の残骸（あれば削除前にユーザー確認。OOM の原因になる）"
shopt -s nullglob
rem=(/tmp/.mount_* /tmp/appimage_extracted_*)
if [ ${#rem[@]} -gt 0 ]; then du -sh "${rem[@]}" 2>/dev/null || true; else echo "なし"; fi
if curl -fs -m 2 "http://127.0.0.1:${port}/" >/dev/null 2>&1; then
  echo "ポート ${port} が既に使われている。MCX_WK_PORT を変える" >&2
  exit 1
fi

export WEBKIT_INSPECTOR_HTTP_SERVER="127.0.0.1:${port}"
if [ "$backend" = x11 ]; then export GDK_BACKEND=x11; else unset GDK_BACKEND; fi

nohup "$target" >"$log_file" 2>&1 &
pid=$!
[ -n "$pid_file" ] && echo "$pid" >"$pid_file"
echo "PID=$pid backend=$backend port=$port log=$log_file"

# インスペクタのポートが応答するまで待つ（最大 60 秒）
for _ in $(seq 1 120); do
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "起動直後にプロセスが終了した。ログ: $log_file" >&2
    exit 1
  fi
  if curl -fs -m 2 "http://127.0.0.1:${port}/" >/dev/null 2>&1; then
    echo "インスペクタ応答 OK: http://127.0.0.1:${port}/"
    # 主窓が X11（XWayland）窓として見えるか（見えれば linux-window.py / linux-shot.sh が使える）
    here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    for _ in $(seq 1 20); do
      if wid=$(python3 "$here/linux-window.py" id 2>/dev/null); then echo "主窓: X11 窓あり id=$wid"; exit 0; fi
      sleep 0.5
    done
    echo "主窓: X11 窓が見えない（Wayland ネイティブで動いている可能性。linux-window.py / linux-shot.sh は使えない）"
    exit 0
  fi
  sleep 0.5
done
echo "インスペクタが 60 秒応答しなかった。ログ: $log_file" >&2
exit 1
