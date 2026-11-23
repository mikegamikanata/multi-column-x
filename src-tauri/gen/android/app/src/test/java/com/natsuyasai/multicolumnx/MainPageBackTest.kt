package com.natsuyasai.multicolumnx

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MainPageBackTest {
  @Test
  fun `画面側が戻る操作を処理したときはアプリ側の戻る処理を行わない`() {
    assertTrue(isBackConsumedByMainPage("true"))
  }

  @Test
  fun `画面側が処理していないと応答したときは従来どおりの戻る処理を行う`() {
    assertFalse(isBackConsumedByMainPage("false"))
  }

  @Test
  fun `画面側から応答がないときは従来どおりの戻る処理を行う`() {
    assertFalse(isBackConsumedByMainPage(null))
    assertFalse(isBackConsumedByMainPage("null"))
    assertFalse(isBackConsumedByMainPage(""))
  }

  @Test
  fun `画面側からの応答が不正な値のときは従来どおりの戻る処理を行う`() {
    assertFalse(isBackConsumedByMainPage("\"true\""))
    assertFalse(isBackConsumedByMainPage("1"))
    assertFalse(isBackConsumedByMainPage("TRUE"))
  }

  @Test
  fun `問い合わせスクリプトは画面側の入口を呼び例外時はfalseを返す`() {
    assertTrue(MAIN_PAGE_BACK_SCRIPT.contains("window.__mcxHandleBack"))
    assertTrue(MAIN_PAGE_BACK_SCRIPT.contains("catch(e){return false}"))
    assertEquals(false, MAIN_PAGE_BACK_SCRIPT.contains("\n"))
  }
}