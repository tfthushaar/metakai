package expo.modules.metakaiscanner

import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.MultiFormatWriter
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import kotlin.random.Random

/** The barcode reading that runs on every camera frame, tried on barcodes drawn here instead of seen by a camera. */
class BarcodeAnalyzerTest {
  private val reader = BarcodeAnalyzer.newReader()

  /** A barcode as a frame of brightness values (0 dark, 255 light), with a quiet zone around it. */
  private fun frame(text: String, format: BarcodeFormat, width: Int = 480, height: Int = 240): ByteArray {
    val matrix = MultiFormatWriter().encode(text, format, width, height, mapOf(EncodeHintType.MARGIN to 20))
    return ByteArray(width * height) { i -> if (matrix.get(i % width, i / width)) 0 else 255.toByte() }
  }

  /** What a phone camera hands over for an upright barcode when its sensor is turned: the frame turned back the other way. */
  private fun sideways(data: ByteArray, width: Int, height: Int, sensorRotation: Int): Triple<ByteArray, Int, Int> {
    // The camera reports how far to turn its frame clockwise to make it upright, so the raw frame is the upright one turned the opposite way.
    val undo = (360 - sensorRotation) % 360
    val turned = BarcodeAnalyzer.turn(data, width, height, undo)
    return Triple(turned.data, turned.width, turned.height)
  }

  @Test
  fun readsAnUprightEan13() {
    val found = BarcodeAnalyzer.decode(reader, frame("5449000000996", BarcodeFormat.EAN_13), 480, 240, 0)
    assertNotNull(found)
    assertEquals("5449000000996", found!!.text)
    assertEquals("EAN_13", found.format)
  }

  @Test
  fun readsTheOtherFoodBarcodes() {
    val cases = listOf("96385074" to BarcodeFormat.EAN_8, "036000291452" to BarcodeFormat.UPC_A, "Metakai 42" to BarcodeFormat.CODE_128)
    for ((text, format) in cases) {
      val found = BarcodeAnalyzer.decode(reader, frame(text, format), 480, 240, 0)
      assertEquals(text, found?.text)
    }
  }

  @Test
  fun readsFramesTheCameraDeliversSideways() {
    val upright = frame("5449000000996", BarcodeFormat.EAN_13)
    for (rotation in listOf(90, 180, 270)) {
      val (data, width, height) = sideways(upright, 480, 240, rotation)
      val found = BarcodeAnalyzer.decode(reader, data, width, height, rotation)
      assertEquals("rotation $rotation", "5449000000996", found?.text)
    }
  }

  @Test
  fun readsAfterAFrameOfNoise() {
    // The reader keeps no state between frames: a frame with nothing in it doesn't spoil the next.
    val noise = Random(7).nextBytes(480 * 240)
    assertNull(BarcodeAnalyzer.decode(reader, noise, 480, 240, 90))
    assertEquals("5449000000996", BarcodeAnalyzer.decode(reader, frame("5449000000996", BarcodeFormat.EAN_13), 480, 240, 0)?.text)
  }

  @Test
  fun ignoresBarcodesOfOtherKinds() {
    // QR codes aren't food barcodes, and are left alone.
    assertNull(BarcodeAnalyzer.decode(reader, frame("https://example.com", BarcodeFormat.QR_CODE, 240, 240), 240, 240, 0))
  }

  @Test
  fun turnsFramesClockwise() {
    // 3 wide, 2 high:  1 2 3 / 4 5 6
    val data = byteArrayOf(1, 2, 3, 4, 5, 6)
    val quarter = BarcodeAnalyzer.turn(data, 3, 2, 90)
    assertEquals(2, quarter.width)
    assertEquals(3, quarter.height)
    assertEquals(listOf<Byte>(4, 1, 5, 2, 6, 3), quarter.data.toList())
    assertEquals(listOf<Byte>(6, 5, 4, 3, 2, 1), BarcodeAnalyzer.turn(data, 3, 2, 180).data.toList())
    assertEquals(listOf<Byte>(3, 6, 2, 5, 1, 4), BarcodeAnalyzer.turn(data, 3, 2, 270).data.toList())
    assertEquals(data.toList(), BarcodeAnalyzer.turn(data, 3, 2, 0).data.toList())
    assertEquals(data.toList(), BarcodeAnalyzer.turn(data, 3, 2, 360).data.toList())
  }
}
