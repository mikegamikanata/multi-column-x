package com.natsuyasai.multicolumnx

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

// 動画ダウンロード（Android）の通知まわりの共通定義。
// 進捗の通知（Foreground Service）と失敗の通知で同じチャンネルを使う。

internal const val VIDEO_DOWNLOAD_CHANNEL_ID = "video_download"
internal const val VIDEO_DOWNLOAD_PROGRESS_NOTIFICATION_ID = 1001

// 進捗の通知と別 ID にする（stopForeground(REMOVE) と同じ ID の notify が競合して消えるのを防ぐ）。
internal const val VIDEO_DOWNLOAD_FAILURE_NOTIFICATION_ID = 1002

// 失敗の通知の表示方針（JVM 単体テストで検証できるよう Android API から切り離した値）。
internal data class VideoDownloadFailureNotificationSpec(
  val notificationId: Int,
  val ongoing: Boolean,
  val autoCancel: Boolean,
)

internal fun videoDownloadFailureNotificationSpec(): VideoDownloadFailureNotificationSpec =
  VideoDownloadFailureNotificationSpec(
    notificationId = VIDEO_DOWNLOAD_FAILURE_NOTIFICATION_ID,
    ongoing = false,
    autoCancel = true,
  )

// Android O 以降のみ通知チャンネル作成が必要。既存チャンネルがあれば再作成しない。
internal fun ensureVideoDownloadNotificationChannel(context: Context) {
  if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
  val manager = context.getSystemService(NotificationManager::class.java)
  if (manager.getNotificationChannel(VIDEO_DOWNLOAD_CHANNEL_ID) != null) return
  val channel =
    NotificationChannel(
      VIDEO_DOWNLOAD_CHANNEL_ID,
      context.getString(R.string.video_download_channel_name),
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = context.getString(R.string.video_download_channel_description)
      setShowBadge(false)
    }
  manager.createNotificationChannel(channel)
}

// 通知タップ時、既存タスクを前面に戻すだけ（新規タスクは積まない）。
// MainActivity が singleTask のため、この Intent で新規画面遷移は発生しない。
internal fun buildVideoDownloadContentIntent(context: Context): PendingIntent {
  val intent =
    Intent(context, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_NEW_TASK
    }
  val flags =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    } else {
      PendingIntent.FLAG_UPDATE_CURRENT
    }
  return PendingIntent.getActivity(context, 0, intent, flags)
}

// 失敗の通知を出す。POST_NOTIFICATIONS が未許可なら何も出ない（既存の割り切りに合わせる）。
internal fun showVideoDownloadFailureNotification(context: Context) {
  ensureVideoDownloadNotificationChannel(context)
  val spec = videoDownloadFailureNotificationSpec()
  val notification =
    NotificationCompat.Builder(context, VIDEO_DOWNLOAD_CHANNEL_ID)
      .setSmallIcon(android.R.drawable.stat_notify_error)
      .setContentTitle(context.getString(R.string.video_download_failed_title))
      .setContentText(context.getString(R.string.video_download_failed_text))
      .setOngoing(spec.ongoing)
      .setAutoCancel(spec.autoCancel)
      .setContentIntent(buildVideoDownloadContentIntent(context))
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()
  try {
    NotificationManagerCompat.from(context).notify(spec.notificationId, notification)
  } catch (e: SecurityException) {
    // 通知の権限が無い端末では表示しない（ダウンロードの失敗自体は Rust のログに残る）。
  }
}

// 次のダウンロード開始時に、前回の失敗の通知を消す。
internal fun cancelVideoDownloadFailureNotification(context: Context) {
  NotificationManagerCompat.from(context).cancel(VIDEO_DOWNLOAD_FAILURE_NOTIFICATION_ID)
}