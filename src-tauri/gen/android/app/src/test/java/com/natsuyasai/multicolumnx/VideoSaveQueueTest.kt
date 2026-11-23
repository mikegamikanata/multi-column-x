package com.natsuyasai.multicolumnx

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class VideoSaveQueueTest {
  @get:Rule
  val tempFolder = TemporaryFolder()

  private val launched = mutableListOf<String>()
  private val written = mutableListOf<Pair<String, String>>()
  private val deleted = mutableListOf<String>()
  private val errors = mutableListOf<String>()
  private var failWrite = false
  private var failLaunchFor: String? = null

  private val queue =
    VideoSaveQueue<String>(
      launch = { name ->
        if (name == failLaunchFor) throw IllegalStateException("launch failed")
        launched.add(name)
      },
      write = { destination, tempPath ->
        if (failWrite) throw java.io.IOException("write failed")
        written.add(destination to tempPath)
      },
      delete = { deleted.add(it) },
      onError = { message, _ -> errors.add(message) },
    )

  private val video = VideoSaveQueue.Request("/tmp/video.tmp", "video.mp4")
  private val audio = VideoSaveQueue.Request("/tmp/audio.tmp", "audio.m4a")

  @Test
  fun `保存要求が続けて来たとき保存先の選択は1件目だけが表示され2件目は待機する`() {
    queue.enqueue(video)
    queue.enqueue(audio)

    assertEquals(listOf("video.mp4"), launched)
  }

  @Test
  fun `1件目の保存が終わると待機中の2件目の保存先の選択が表示される`() {
    queue.enqueue(video)
    queue.enqueue(audio)

    queue.onResult("dest-video")

    assertEquals(listOf("video.mp4", "audio.m4a"), launched)
  }

  @Test
  fun `続けて保存するとそれぞれの保存先に対応する一時ファイルの内容が書き込まれる`() {
    val videoFile = tempFolder.newFile("video.tmp").apply { writeText("VIDEO-CONTENT") }
    val audioFile = tempFolder.newFile("audio.tmp").apply { writeText("AUDIO-CONTENT") }
    val contents = mutableMapOf<String, String>()
    val realQueue =
      VideoSaveQueue<String>(
        launch = {},
        write = { destination, tempPath -> contents[destination] = File(tempPath).readText() },
        delete = { File(it).delete() },
        onError = { _, _ -> },
      )
    realQueue.enqueue(VideoSaveQueue.Request(videoFile.path, "video.mp4"))
    realQueue.enqueue(VideoSaveQueue.Request(audioFile.path, "audio.m4a"))

    realQueue.onResult("dest-video")
    realQueue.onResult("dest-audio")

    assertEquals(mapOf("dest-video" to "VIDEO-CONTENT", "dest-audio" to "AUDIO-CONTENT"), contents)
    assertFalse(videoFile.exists())
    assertFalse(audioFile.exists())
  }

  @Test
  fun `保存先の選択をキャンセルしたときその一時ファイルは削除され次の保存先の選択に進む`() {
    queue.enqueue(video)
    queue.enqueue(audio)

    queue.onResult(null)

    assertTrue(written.isEmpty())
    assertEquals(listOf(video.tempPath), deleted)
    assertEquals(listOf("video.mp4", "audio.m4a"), launched)
  }

  @Test
  fun `保存先への書き込みに失敗したときもその一時ファイルは削除され次の保存先の選択に進む`() {
    queue.enqueue(video)
    queue.enqueue(audio)
    failWrite = true

    queue.onResult("dest-video")

    assertEquals(1, errors.size)
    assertEquals(listOf(video.tempPath), deleted)
    assertEquals(listOf("video.mp4", "audio.m4a"), launched)
  }

  @Test
  fun `1件だけの保存要求はこれまでどおり保存先の選択を経て保存され一時ファイルが削除される`() {
    queue.enqueue(video)
    queue.onResult("dest-video")

    assertEquals(listOf("dest-video" to video.tempPath), written)
    assertEquals(listOf(video.tempPath), deleted)
    assertEquals(listOf("video.mp4"), launched)
  }

  @Test
  fun `保存ダイアログを表示できなかったときその一時ファイルは削除され次の要求へ進む`() {
    val first = VideoSaveQueue.Request("/tmp/first.tmp", "first.mp4")
    failLaunchFor = "video.mp4"
    queue.enqueue(first)
    queue.enqueue(video)
    queue.enqueue(audio)

    queue.onResult("dest-first")

    assertEquals(listOf("first.mp4", "audio.m4a"), launched)
    assertEquals(listOf(first.tempPath, video.tempPath), deleted)
    assertEquals(1, errors.size)
  }

  @Test
  fun `表示中の要求が無いときに結果が返っても何もしない`() {
    queue.onResult("dest")

    assertTrue(written.isEmpty())
    assertTrue(deleted.isEmpty())
    assertTrue(launched.isEmpty())
  }
}