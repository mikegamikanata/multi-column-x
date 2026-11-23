#!/usr/bin/env bash
# Linux のアプリデータ（~/.local/share/com.natsuyasai.multicolumnx）の退避・比較・復元。
#   使い方: linux-appdata.sh <コマンド> <退避先ディレクトリ> [オプション]
#   backup <dir>                         データ全体を <dir>/<識別子>/ へコピー（約 700MB）
#   diff <dir> [--ignore-window-bounds]  settings.json を退避と意味比較（json-diff.cjs）。差分があれば exit 1
#   restore-settings <dir>               settings.json だけを退避から戻す
#   restore-all <dir>                    データ全体を退避へ戻す（破壊的。試験で増えたファイルは消える）
#   環境変数: MCX_DATA_DIR（既定 ${XDG_DATA_HOME:-~/.local/share}/com.natsuyasai.multicolumnx）
#   アプリ起動中（multicolumnx プロセスあり）は backup / restore を拒否する（diff は可）。
set -euo pipefail

id="com.natsuyasai.multicolumnx"
data="${MCX_DATA_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/$id}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cmd="${1:-}"
dir="${2:-}"
if [ -z "$cmd" ] || [ -z "$dir" ]; then
  echo "usage: linux-appdata.sh <backup|diff|restore-settings|restore-all> <dir> [--ignore-window-bounds]" >&2
  exit 2
fi
shift 2
bk="$dir/$id"

refuse_if_running() {
  if pgrep -x multicolumnx >/dev/null; then
    echo "multicolumnx が起動中。正常終了させてから実行する（PID: $(pgrep -x multicolumnx | tr '\n' ' ')）" >&2
    exit 1
  fi
}

case "$cmd" in
  backup)
    refuse_if_running
    if [ -e "$bk" ]; then echo "退避先が既にある: $bk（上書きしない。別の場所を指定する）" >&2; exit 1; fi
    mkdir -p "$dir"
    cp -a "$data" "$bk"
    echo "退避完了: $bk ($(du -sh "$bk" | cut -f1))"
    ;;
  diff)
    ign=""
    for a in "$@"; do [ "$a" = "--ignore-window-bounds" ] && ign="--ignore=windowBounds"; done
    node "$here/json-diff.cjs" "$bk/settings.json" "$data/settings.json" ${ign:+"$ign"}
    ;;
  restore-settings)
    refuse_if_running
    cp -a "$bk/settings.json" "$data/settings.json"
    echo "settings.json を復元した"
    ;;
  restore-all)
    refuse_if_running
    [ -d "$bk" ] || { echo "退避が無い: $bk" >&2; exit 1; }
    if command -v rsync >/dev/null; then
      rsync -a --delete "$bk/" "$data/"
    else
      rm -rf "$data"
      cp -a "$bk" "$data"
    fi
    echo "全体を復元した: $data"
    ;;
  *)
    echo "不明なコマンド: $cmd" >&2
    exit 2
    ;;
esac
