package com.natsuyasai.multicolumnx

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class VideoDownloadNotificationsTest {
  @Test
  fun `失敗の通知は進捗の通知を置き換え、スワイプで消せる`() {
    val spec = videoDownloadFailureNotificationSpec()

    // 進捗の通知（フォアグラウンド）の ID と別にして、進捗の通知の消去と競合しないようにする。
    assertNotEquals(VIDEO_DOWNLOAD_PROGRESS_NOTIFICATION_ID, spec.notificationId)
    // 常駐させず、スワイプで消せる。
    assertFalse(spec.ongoing)
    assertTrue(spec.autoCancel)
  }

  @Test
  fun `失敗の通知のidは固定値を使う`() {
    assertEquals(1002, videoDownloadFailureNotificationSpec().notificationId)
  }
}