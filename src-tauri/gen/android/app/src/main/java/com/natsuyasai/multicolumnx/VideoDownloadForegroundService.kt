package com.natsuyasai.multicolumnx

import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat

// 動画ダウンロード（Android）用の Foreground Service。
// アプリがバックグラウンドに回っても OS にプロセスを kill されにくくするため、
// ダウンロード中はフォアグラウンド優先度に昇格し、進捗を通知として表示し続ける。
// 開始/進捗更新/終了は Rust 側（video_download.rs）から JNI 経由で MainActivity の
// notifyVideoDownload* メソッドを介して呼ばれる。
class VideoDownloadForegroundService : Service() {
  // bound service ではないため常に null を返す。
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(
    intent: Intent?,
    flags: Int,
    startId: Int,
  ): Int {
    when (intent?.action) {
      ACTION_START -> handleStart()
      ACTION_UPDATE -> intent.let { handleUpdate(it) }
      ACTION_FINISH -> handleFinish()
    }
    return START_NOT_STICKY
  }

  // フォアグラウンド昇格。通知チャンネルを作成してから startForeground する。
  private fun handleStart() {
    // 前回の失敗の通知は、新しいダウンロードの進捗の通知に置き換える。
    cancelVideoDownloadFailureNotification(this)
    ensureVideoDownloadNotificationChannel(this)
    val notification =
      buildNotificationBuilder(contentText = getString(R.string.video_download_preparing))
        .setProgress(0, 0, true)
        .build()
    ServiceCompat.startForeground(
      this,
      VIDEO_DOWNLOAD_PROGRESS_NOTIFICATION_ID,
      notification,
      ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
    )
  }

  // 進捗更新。total <= 0 は「不明」を表すセンチネル値として扱い、
  // indeterminate（不確定）プログレスバー表示に切り替える。
  private fun handleUpdate(intent: Intent) {
    val fileIndex = intent.getIntExtra(EXTRA_FILE_INDEX, 1)
    val fileCount = intent.getIntExtra(EXTRA_FILE_COUNT, 1)
    val current = intent.getLongExtra(EXTRA_CURRENT, 0L)
    val total = intent.getLongExtra(EXTRA_TOTAL, 0L)

    val filePrefix = getString(R.string.video_download_progress_file, fileIndex, fileCount)
    val builder = buildNotificationBuilder(contentText = buildProgressText(filePrefix, current, total))
    if (total > 0) {
      val percent = ((current * 100) / total).toInt().coerceIn(0, 100)
      builder.setProgress(100, percent, false)
    } else {
      builder.setProgress(0, 0, true)
    }

    // POST_NOTIFICATIONS が未許可の場合、notify は何もしない（クラッシュしない）標準挙動に任せる。
    NotificationManagerCompat.from(this).notify(VIDEO_DOWNLOAD_PROGRESS_NOTIFICATION_ID, builder.build())
  }

  // フォアグラウンド状態を解除して通知を消し、サービスを停止する。
  private fun handleFinish() {
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun buildNotificationBuilder(contentText: String): NotificationCompat.Builder =
    NotificationCompat.Builder(this, VIDEO_DOWNLOAD_CHANNEL_ID)
      .setSmallIcon(android.R.drawable.stat_sys_download)
      .setContentTitle(getString(R.string.video_download_notification_title))
      .setContentText(contentText)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(buildVideoDownloadContentIntent(this))
      .setPriority(NotificationCompat.PRIORITY_LOW)

  companion object {
    const val ACTION_START = "com.natsuyasai.multicolumnx.action.VIDEO_DOWNLOAD_START"
    const val ACTION_UPDATE = "com.natsuyasai.multicolumnx.action.VIDEO_DOWNLOAD_UPDATE"
    const val ACTION_FINISH = "com.natsuyasai.multicolumnx.action.VIDEO_DOWNLOAD_FINISH"

    const val EXTRA_FILE_INDEX = "fileIndex"
    const val EXTRA_FILE_COUNT = "fileCount"
    const val EXTRA_CURRENT = "current"
    const val EXTRA_TOTAL = "total"
  }
}

// 通知本文（「ファイル 1/2 (42%)」のような文字列）を組み立てる純粋関数。
// filePrefix は文字列リソースで整形済みの「ファイル 1/2」部分。total <= 0 は進捗不明のため prefix のみ返す。
internal fun buildProgressText(
  filePrefix: String,
  current: Long,
  total: Long,
): String {
  if (total <= 0) return filePrefix
  val percent = ((current * 100) / total).coerceIn(0, 100)
  return "$filePrefix ($percent%)"
}