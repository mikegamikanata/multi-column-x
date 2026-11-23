package com.natsuyasai.multicolumnx

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** PopupSessionBridge（ポップアップ連携メッセージ → コールバック振り分け）のテスト。 */
class PopupSessionBridgeTest {
  private val switchSessionCalls = mutableListOf<Triple<String, String, String>>()
  private val reportOfficialSettingsCalls = mutableListOf<Pair<String, String>>()
  private val closePopupCalls = mutableListOf<String>()
  private val downloadVideoCalls = mutableListOf<String>()

  private val bridge =
    PopupSessionBridge(
      "popup-1",
      { popupId, accountId, url -> switchSessionCalls.add(Triple(popupId, accountId, url)) },
      { accountId, snapshot -> reportOfficialSettingsCalls.add(Pair(accountId, snapshot)) },
      { popupId -> closePopupCalls.add(popupId) },
      { payloadJson -> downloadVideoCalls.add(payloadJson) },
    )

  @Test
  fun `switchpopupsessionメッセージはポップアップidを付けてコールバックへ転送される`() {
    bridge.handle(BridgeMessage.SwitchPopupSession("acc2", "https://x.com/foo"))

    assertEquals(listOf(Triple("popup-1", "acc2", "https://x.com/foo")), switchSessionCalls)
  }

  @Test
  fun `reportofficialsettingsメッセージはaccountidとsnapshotをコールバックへ転送される`() {
    bridge.handle(BridgeMessage.ReportOfficialSettings("acc2", """{"theme":"dark"}"""))

    assertEquals(listOf(Pair("acc2", """{"theme":"dark"}""")), reportOfficialSettingsCalls)
  }

  @Test
  fun `closepopupメッセージはポップアップidを付けてコールバックへ転送される`() {
    bridge.handle(BridgeMessage.ClosePopup)

    assertEquals(listOf("popup-1"), closePopupCalls)
  }

  @Test
  fun `対象外のメッセージは無視される`() {
    bridge.handle(BridgeMessage.ReportApiRateLimit("payload"))

    assertTrue(switchSessionCalls.isEmpty())
    assertTrue(reportOfficialSettingsCalls.isEmpty())
    assertTrue(closePopupCalls.isEmpty())
    assertTrue(downloadVideoCalls.isEmpty())
  }

  @Test
  fun `ポップアップからのダウンロード要求はカラムの長押しと同じ保存処理に届く`() {
    val payload = """{"variants":[],"suggestedFileName":"123"}"""

    bridge.handle(BridgeMessage.DownloadVideo(payload))

    assertEquals(listOf(payload), downloadVideoCalls)
    assertTrue(switchSessionCalls.isEmpty())
    assertTrue(reportOfficialSettingsCalls.isEmpty())
    assertTrue(closePopupCalls.isEmpty())
  }
}