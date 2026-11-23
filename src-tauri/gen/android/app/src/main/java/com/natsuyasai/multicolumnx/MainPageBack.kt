package com.natsuyasai.multicolumnx

/** メイン画面（React）に戻る操作を問い合わせる JS。例外時も false を返す */
const val MAIN_PAGE_BACK_SCRIPT =
  "(function(){try{return window.__mcxHandleBack?!!window.__mcxHandleBack():false}catch(e){return false}})()"

/** evaluateJavascript の結果文字列から、画面側が戻る操作を処理したかを判定する */
fun isBackConsumedByMainPage(result: String?): Boolean = result == "true"