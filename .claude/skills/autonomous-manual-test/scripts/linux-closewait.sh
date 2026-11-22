#!/usr/bin/env bash
# 主窓に WM_DELETE_WINDOW を送り、アプリのプロセスが消えるまで待つ（強制終了はしない）。
#   使い方: linux-closewait.sh <pid> [timeout秒（既定 30）]
#   経過秒と残存プロセスを出す。残っていれば exit 1。GDK_BACKEND=x11 起動のアプリ向け。
#   <pid> は linux-launch.sh が出した PID（AppImage の場合は runtime の PID。その配下が全部消えるまで待つ）。
set -euo pipefail
pid="${1:?usage: linux-closewait.sh <pid> [timeout]}"
timeout="${2:-30}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

t0=$(date +%s.%N)
python3 "$here/linux-window.py" close
gone=false
for _ in $(seq 1 $((timeout * 2))); do
  sleep 0.5
  if ! kill -0 "$pid" 2>/dev/null && ! pgrep -x multicolumnx >/dev/null; then gone=true; break; fi
done
elapsed=$(awk -v a="$t0" -v b="$(date +%s.%N)" 'BEGIN{printf "%.1f", b-a}')
echo "gone=$gone elapsed=${elapsed}s"
if [ "$gone" != true ]; then
  kill -0 "$pid" 2>/dev/null && echo "REMAIN pid=$pid"
  pgrep -x multicolumnx | sed 's/^/REMAIN pid=/' || true
  exit 1
fi
