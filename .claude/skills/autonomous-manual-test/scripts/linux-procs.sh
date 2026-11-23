#!/usr/bin/env bash
# 試験対象プロセスの子孫の列挙・旧マウント参照の検査・マウント一覧・子孫のみの kill。
#   使い方:
#     linux-procs.sh tree <pid>              <pid> とその子孫の PID / PPID / comm / cmdline（先頭 120 字）
#     linux-procs.sh maps <pid> <文字列>      <pid> と子孫の environ / fd / maps に <文字列>（例: 旧マウント名 .mount_xxxxxx）
#                                            が含まれるか検査。含むものがあれば表示して exit 1（L-03 / L-04 / L-07 用）
#     linux-procs.sh mounts                  /tmp/.mount_* の一覧（AppImage のマウント。再起動・更新後に増えていないか確認）
#     linux-procs.sh kill <root-pid> <pid> [signal]
#                                            <pid> が <root-pid> の子孫（自身は不可）であることを検証してから signal（既定 KILL）を送る
#                                            （L-12: カラムの WebKitWebProcess を落とす）
#   名前での kill（pkill / killall）は使わない。他アプリの WebKit や自分のシェルを巻き込む。
set -euo pipefail

children() { awk '{print $1}' < <(ps -o pid= --ppid "$1" 2>/dev/null) || true; }

descendants() { # $1=root。root 自身を含めて出力
  local stack=("$1") p
  while [ ${#stack[@]} -gt 0 ]; do
    p="${stack[0]}"; stack=("${stack[@]:1}")
    [ -d "/proc/$p" ] || continue
    echo "$p"
    while read -r c; do [ -n "$c" ] && stack+=("$c"); done < <(children "$p")
  done
}

cmd="${1:-}"
case "$cmd" in
  tree)
    root="${2:?usage: linux-procs.sh tree <pid>}"
    printf '%-8s %-8s %-18s %s\n' PID PPID COMM CMDLINE
    for p in $(descendants "$root"); do
      ppid=$(awk '/^PPid:/{print $2}' "/proc/$p/status" 2>/dev/null || echo "?")
      comm=$(cat "/proc/$p/comm" 2>/dev/null || echo "?")
      line=$({ tr '\0' ' ' < "/proc/$p/cmdline"; } 2>/dev/null | cut -c1-120 || true)
      printf '%-8s %-8s %-18s %s\n' "$p" "$ppid" "$comm" "$line"
    done
    ;;
  maps)
    root="${2:?usage: linux-procs.sh maps <pid> <文字列>}"
    needle="${3:?usage: linux-procs.sh maps <pid> <文字列>}"
    n=0; hit=0
    for p in $(descendants "$root"); do
      n=$((n + 1))
      # fd は readlink、maps / environ は grep -a。権限が無いファイルは読めないだけで無視する
      env_txt="$( { tr '\0' '\n' < "/proc/$p/environ"; } 2>/dev/null || true)"
      if grep -qF -- "$needle" <<<"$env_txt"; then echo "HIT environ pid=$p ($(cat /proc/$p/comm))"; hit=$((hit + 1)); fi
      if grep -qF -- "$needle" "/proc/$p/maps" 2>/dev/null; then echo "HIT maps pid=$p ($(cat /proc/$p/comm))"; hit=$((hit + 1)); fi
      fd_txt="$(find "/proc/$p/fd" -maxdepth 1 -type l -exec readlink {} + 2>/dev/null || true)"
      if grep -qF -- "$needle" <<<"$fd_txt"; then echo "HIT fd pid=$p ($(cat /proc/$p/comm))"; hit=$((hit + 1)); fi
    done
    echo "検査したプロセス数=$n 一致=$hit"
    [ "$hit" -eq 0 ]
    ;;
  mounts)
    shopt -s nullglob
    m=(/tmp/.mount_*)
    if [ ${#m[@]} -eq 0 ]; then echo "なし"; else
      for d in "${m[@]}"; do
        if mountpoint -q "$d" 2>/dev/null; then echo "mounted $d"; else echo "残骸（未マウント）$d"; fi
      done
    fi
    ;;
  kill)
    root="${2:?usage: linux-procs.sh kill <root-pid> <pid> [signal]}"
    target="${3:?usage: linux-procs.sh kill <root-pid> <pid> [signal]}"
    sig="${4:-KILL}"
    if [ "$target" = "$root" ]; then echo "root 自身は対象外" >&2; exit 1; fi
    desc="$(descendants "$root")"
    if ! grep -qx -- "$target" <<<"$desc"; then echo "$target は $root の子孫ではない。kill しない" >&2; exit 1; fi
    echo "kill -$sig $target ($(cat "/proc/$target/comm"))"
    kill "-$sig" "$target"
    ;;
  *)
    echo "usage: linux-procs.sh <tree|maps|mounts|kill> ..." >&2
    exit 2
    ;;
esac
