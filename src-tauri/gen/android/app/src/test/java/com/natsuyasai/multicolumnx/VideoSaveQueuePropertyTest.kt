package com.natsuyasai.multicolumnx

import io.kotest.property.Arb
import io.kotest.property.arbitrary.int
import io.kotest.property.arbitrary.list
import io.kotest.property.forAll
import kotlinx.coroutines.runBlocking
import org.junit.Test

/**
 * VideoSaveQueue（保存要求を要求順に 1 件ずつ保存ダイアログへ流すキュー）に対するプロパティベーステスト。
 * 要求の個数・結果の種類・enqueue と onResult の並びをランダムに変えても、順序・削除・同時表示数の不変条件が保たれることを確認する。
 */
class VideoSaveQueuePropertyTest {
  /** 保存ダイアログの結果の種類。0=保存先あり / 1=キャンセル / 2=書き込み失敗 */
  private fun resultOf(kind: Int): String? =
    when (kind % 3) {
      0 -> "dest"
      1 -> null
      else -> FAIL_DEST
    }

  /** 記録付きのキューと、その記録を束ねるハーネス。launch が failNames の名前で例外を投げる。 */
  private class Harness(
    private val failNames: Set<String> = emptySet(),
  ) {
    val launched = mutableListOf<String>()
    val deleted = mutableListOf<String>()
    val enqueued = mutableListOf<VideoSaveQueue.Request>()
    var overlapped = false
    private var shown = false

    val queue =
      VideoSaveQueue<String>(
        launch = { name ->
          if (name in failNames) throw IllegalStateException("launch failed")
          // 結果が返る前に 2 回目の表示が来たら同時表示（違反）
          if (shown) overlapped = true
          shown = true
          launched.add(name)
        },
        write = { destination, _ -> if (destination == FAIL_DEST) throw java.io.IOException("write failed") },
        delete = { deleted.add(it) },
        onError = { _, _ -> },
      )

    fun enqueue() {
      val index = enqueued.size
      val request = VideoSaveQueue.Request("/tmp/$index.tmp", "$index.mp4")
      enqueued.add(request)
      queue.enqueue(request)
    }

    fun result(destination: String?) {
      shown = false
      queue.onResult(destination)
    }

    /** 残りの要求をすべて処理し切る（余分な onResult は何もしない仕様なので多めに呼ぶ）。 */
    fun drain(kinds: (Int) -> String?) {
      repeat(enqueued.size + 1) { result(kinds(it)) }
    }
  }

  @Test
  fun `任意個数の要求を順に処理すると保存ダイアログは要求した順に表示される`() {
    runBlocking {
      forAll(Arb.int(0..20), Arb.list(Arb.int(0..2), 0..20)) { count, kinds ->
        val h = Harness()
        repeat(count) { h.enqueue() }
        h.drain { resultOf(kinds.getOrElse(it) { 0 }) }
        h.launched == h.enqueued.map { it.suggestedFileName }
      }
    }
  }

  @Test
  fun `任意個数の要求を結果の種類によらず処理すると一時ファイルはちょうど1回ずつ要求順に削除される`() {
    runBlocking {
      forAll(Arb.int(0..20), Arb.list(Arb.int(0..2), 0..20)) { count, kinds ->
        val h = Harness()
        repeat(count) { h.enqueue() }
        h.drain { resultOf(kinds.getOrElse(it) { 0 }) }
        h.deleted == h.enqueued.map { it.tempPath }
      }
    }
  }

  @Test
  fun `保存ダイアログを表示できない要求が混ざっても全ての一時ファイルはちょうど1回ずつ削除され表示順は要求順を保つ`() {
    runBlocking {
      forAll(Arb.int(0..20), Arb.list(Arb.int(0..2), 0..20), Arb.list(Arb.int(0..19), 0..20)) { count, kinds, failIndexes ->
        val failNames = failIndexes.map { "$it.mp4" }.toSet()
        val h = Harness(failNames)
        repeat(count) { h.enqueue() }
        h.drain { resultOf(kinds.getOrElse(it) { 0 }) }
        val expectedLaunched = h.enqueued.map { it.suggestedFileName }.filter { it !in failNames }
        h.launched == expectedLaunched &&
          h.deleted.sorted() == h.enqueued.map { it.tempPath }.sorted() &&
          h.deleted.size == h.enqueued.size
      }
    }
  }

  @Test
  fun `要求の追加と結果の通知が交互に混ざっても表示は要求順で同時に表示される要求は高々1件で削除はちょうど1回ずつ`() {
    runBlocking {
      // 0=enqueue / 1..3=結果（保存先あり・キャンセル・書き込み失敗）
      forAll(Arb.list(Arb.int(0..3), 0..40), Arb.list(Arb.int(0..19), 0..10)) { ops, failIndexes ->
        val failNames = failIndexes.map { "$it.mp4" }.toSet()
        val h = Harness(failNames)
        ops.forEach { op -> if (op == 0) h.enqueue() else h.result(resultOf(op - 1)) }
        h.drain { resultOf(it) }
        val expectedLaunched = h.enqueued.map { it.suggestedFileName }.filter { it !in failNames }
        !h.overlapped &&
          h.launched == expectedLaunched &&
          h.deleted.sorted() == h.enqueued.map { it.tempPath }.sorted() &&
          h.deleted.size == h.enqueued.size
      }
    }
  }

  private companion object {
    const val FAIL_DEST = "fail"
  }
}