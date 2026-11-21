package com.natsuyasai.multicolumnx

/**
 * ダウンロード済み一時ファイルの SAF 保存要求を、要求順に 1 件ずつ処理するキュー。
 *
 * HLS の動画は映像と音声の保存要求が続けて届くが、保存ダイアログは同時に 1 つしか扱えないため、
 * 表示中の要求の結果が返るまで後続の要求を待たせる。
 * UI スレッドからのみ操作する前提のため同期化はしない。
 *
 * @param D 保存先の型（本番は android.net.Uri）。テストで Android 依存を切り離すための型引数。
 * @param launch 保存ダイアログを表示する（引数は提案ファイル名）
 * @param write 一時ファイルの内容を保存先へ書き込む（失敗時は例外を投げてよい）
 * @param delete 一時ファイルを削除する
 * @param onError 書き込み失敗・ダイアログ表示失敗を通知する（ログ出力用）
 */
class VideoSaveQueue<D>(
  private val launch: (suggestedFileName: String) -> Unit,
  private val write: (destination: D, tempPath: String) -> Unit,
  private val delete: (tempPath: String) -> Unit,
  private val onError: (message: String, error: Exception) -> Unit,
) {
  data class Request(
    val tempPath: String,
    val suggestedFileName: String,
  )

  private val waiting = ArrayDeque<Request>()
  private var active: Request? = null

  /** 保存要求を追加する。表示中の要求が無ければすぐ保存ダイアログを表示する。 */
  fun enqueue(request: Request) {
    waiting.addLast(request)
    if (active == null) showNext()
  }

  /**
   * 表示中の要求の保存ダイアログの結果を処理する。
   * destination が null（キャンセル）なら書き込まない。成否に関わらず一時ファイルを削除し、次の要求へ進む。
   * 表示中の要求が無ければ何もしない。
   */
  fun onResult(destination: D?) {
    val request = active ?: return
    active = null
    try {
      if (destination != null) write(destination, request.tempPath)
    } catch (e: Exception) {
      onError("failed to write ${request.tempPath}", e)
    } finally {
      delete(request.tempPath)
    }
    showNext()
  }

  // 待機中の先頭から順に保存ダイアログの表示を試みる。表示できなかった要求は一時ファイルを削除して次へ進む。
  private fun showNext() {
    while (true) {
      val next = waiting.removeFirstOrNull() ?: return
      try {
        launch(next.suggestedFileName)
        active = next
        return
      } catch (e: Exception) {
        onError("failed to launch save dialog for ${next.tempPath}", e)
        delete(next.tempPath)
      }
    }
  }
}