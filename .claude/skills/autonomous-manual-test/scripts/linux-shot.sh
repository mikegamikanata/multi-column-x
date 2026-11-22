#!/usr/bin/env bash
# X11（XWayland）上の主窓（または root）を PNG で保存する（ImageMagick の import）。
#   使い方: linux-shot.sh <out.png> [--root]
#   Wayland ネイティブ起動の窓は撮れない（撮れるのは XWayland 窓のみ）。Wayland のスクリーンショットは
#   ポータルの許可ダイアログが出るため自動化しない。WebView 単位の画像は wk.cjs shot を使う。
set -euo pipefail
out="${1:?usage: linux-shot.sh <out.png> [--root]}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ "${2:-}" = "--root" ]; then
  import -window root "$out"
else
  import -window "$(python3 "$here/linux-window.py" id)" "$out"
fi
echo "$out ($(identify -format '%wx%h' "$out" 2>/dev/null || echo '?'))"
