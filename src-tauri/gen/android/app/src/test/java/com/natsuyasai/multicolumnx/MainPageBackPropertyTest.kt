package com.natsuyasai.multicolumnx

import io.kotest.property.Arb
import io.kotest.property.arbitrary.string
import io.kotest.property.forAll
import kotlinx.coroutines.runBlocking
import org.junit.Test

class MainPageBackPropertyTest {
  @Test
  fun `trueちょうど以外の任意の文字列は画面側が処理したとは扱われない`() {
    runBlocking {
      forAll(Arb.string()) { result ->
        result == "true" || !isBackConsumedByMainPage(result)
      }
    }
  }
}