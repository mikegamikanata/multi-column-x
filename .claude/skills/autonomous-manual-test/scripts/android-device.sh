#!/usr/bin/env bash
# Android エミュレータ / 実機の操作ヘルパー（adb）。
#   使い方: android-device.sh <コマンド> [引数...]
#   環境変数: ANDROID_SERIAL（例 emulator-5554。複数端末があるとき必須） / ADB（adb のパス。既定 adb）
#             MCX_PACKAGE / MCX_ACTIVITY（既定は com.natsuyasai.multicolumnx）
#
#   state-save <file>      試験前の端末設定を記録（font_scale / night / rotation / airplane / wifi / data / locale）
#   state-restore <file>   記録した設定へ戻す（試験後に必ず実行）
#   shot <out.png>         スクリーンショット
#   dump [out.xml]         uiautomator dump。座標特定用
#   find <text|desc>       dump から text / content-desc が部分一致する最初の要素の中心座標を "x y" で出力
#   tap-text <text|desc>   find した要素をタップ
#   tap <x> <y> / swipe <x1> <y1> <x2> <y2> [ms] / key <KEYCODE>
#   font-scale <1.0|1.3|...> / night <yes|no|auto> / rotate <0|1|2|3>（0=縦, 1=横） / net <off|on>
#   install <apk>          adb install -r（ログイン状態を保つ）
#   start / stop           アプリの起動 / force-stop
#   logcat-tail [n]        直近ログ（アプリ関連のみ）
set -u
ADB="${ADB:-adb}"
a() { if [ -n "${ANDROID_SERIAL:-}" ]; then "$ADB" -s "$ANDROID_SERIAL" "$@"; else "$ADB" "$@"; fi; }
PKG="${MCX_PACKAGE:-com.natsuyasai.multicolumnx}"
ACT="${MCX_ACTIVITY:-com.natsuyasai.multicolumnx/.MainActivity}"
TMP="${TMPDIR:-/tmp}"
cmd="${1:-}"
[ $# -gt 0 ] && shift

get() { a shell settings get "$1" "$2" | tr -d '\r'; }

# uiautomator dump の XML から部分一致する要素の中心座標を出す
find_xy() {
  a shell uiautomator dump /sdcard/mcx-ui.xml >/dev/null && a pull /sdcard/mcx-ui.xml "$TMP/mcx-ui.xml" >/dev/null
  node -e '
    const x = require("fs").readFileSync(process.argv[1], "utf8"), t = process.argv[2];
    for (const m of x.matchAll(/<node [^>]*>/g)) {
      const n = m[0], g = (k) => (n.match(new RegExp(" " + k + "=\"([^\"]*)\"")) || [])[1] || "";
      if ((g("text") + "|" + g("content-desc")).includes(t)) {
        const b = g("bounds").match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
        if (b) { console.log(Math.round((+b[1] + +b[3]) / 2) + " " + Math.round((+b[2] + +b[4]) / 2)); break; }
      }
    }' "$TMP/mcx-ui.xml" "$1"
}

case "$cmd" in
  state-save)
    out="$1"
    {
      echo "font_scale=$(get system font_scale)"
      echo "user_rotation=$(get system user_rotation)"
      echo "accelerometer_rotation=$(get system accelerometer_rotation)"
      echo "airplane_mode_on=$(get global airplane_mode_on)"
      echo "wifi_on=$(get global wifi_on)"
      echo "mobile_data=$(get global mobile_data)"
      echo "night=$(a shell cmd uimode night | tr -d '\r' | sed 's/Night mode: //')"
      echo "app_locales=$(a shell cmd locale get-app-locales "$PKG" 2>/dev/null | tr -d '\r' | head -1)"
      echo "system_locale=$(a shell getprop persist.sys.locale | tr -d '\r')"
    } >"$out"
    cat "$out" ;;
  state-restore)
    f="$1"
    v() { grep "^$1=" "$f" | head -1 | cut -d= -f2-; }
    fs=$(v font_scale)
    if [ "$fs" = "null" ]; then a shell settings delete system font_scale; else a shell settings put system font_scale "$fs"; fi
    a shell settings put system accelerometer_rotation "$(v accelerometer_rotation)"
    a shell settings put system user_rotation "$(v user_rotation)"
    case "$(v night)" in *yes*) a shell cmd uimode night yes ;; *no*) a shell cmd uimode night no ;; *) a shell cmd uimode night auto ;; esac
    if [ "$(v airplane_mode_on)" = "1" ]; then a shell cmd connectivity airplane-mode enable; else a shell cmd connectivity airplane-mode disable; fi
    if [ "$(v wifi_on)" = "1" ]; then a shell svc wifi enable; else a shell svc wifi disable; fi
    if [ "$(v mobile_data)" = "1" ]; then a shell svc data enable; else a shell svc data disable; fi
    echo "復元しました。state-save で再記録して記録との差分が無いことを確認してください" ;;
  shot) a exec-out screencap -p >"$1" && echo "$1" ;;
  dump)
    out="${1:-$TMP/mcx-ui.xml}"
    a shell uiautomator dump /sdcard/mcx-ui.xml >/dev/null && a pull /sdcard/mcx-ui.xml "$out" >/dev/null && echo "$out" ;;
  find | tap-text)
    xy=$(find_xy "$1")
    if [ -z "$xy" ]; then echo "見つかりません: $1" >&2; exit 1; fi
    if [ "$cmd" = "find" ]; then echo "$xy"; else a shell input tap $xy; echo "tap $xy"; fi ;;
  tap) a shell input tap "$1" "$2" ;;
  swipe) a shell input swipe "$1" "$2" "$3" "$4" "${5:-300}" ;;
  key) a shell input keyevent "$1" ;;
  font-scale) a shell settings put system font_scale "$1" ;;
  night) a shell cmd uimode night "$1" ;;
  rotate) a shell settings put system accelerometer_rotation 0; a shell settings put system user_rotation "$1" ;;
  net)
    # エミュレータは機内モードだけでは遮断されないため wifi / data も切る
    if [ "$1" = "off" ]; then
      a shell cmd connectivity airplane-mode enable; a shell svc wifi disable; a shell svc data disable
    else
      a shell cmd connectivity airplane-mode disable; a shell svc wifi enable; a shell svc data enable
    fi ;;
  install) a install -r "$1" ;;
  start) a shell am start -n "$ACT" ;;
  stop) a shell am force-stop "$PKG" ;;
  logcat-tail) a logcat -d -t "${1:-200}" | grep -iE "multicolumnx|AndroidRuntime|chromium" ;;
  *) sed -n '2,19p' "$0"; exit 2 ;;
esac
