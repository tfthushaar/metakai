package expo.modules.metakaiscanner

import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.ReaderException
import com.google.zxing.common.HybridBinarizer

/**
 * Reads food barcodes from camera frames with ZXing, on the brightness (Y) plane only. Frames come
 * sideways on most phones, so they are turned upright first; the one-dimensional readers can't do that themselves.
 */
class BarcodeAnalyzer(private val onFound: (text: String, format: String) -> Unit) : ImageAnalysis.Analyzer {
  @Volatile
  var active = true

  private val reader = newReader()

  override fun analyze(image: ImageProxy) {
    try {
      if (!active) return
      val plane = image.planes[0]
      val width = image.width
      val height = image.height
      val buffer = plane.buffer
      val luminance = ByteArray(width * height)
      // Rows in the buffer can be padded; copy just the pixels.
      for (y in 0 until height) {
        buffer.position(y * plane.rowStride)
        buffer.get(luminance, y * width, width)
      }
      decode(reader, luminance, width, height, image.imageInfo.rotationDegrees)?.let { onFound(it.text, it.format) }
    } finally {
      image.close()
    }
  }

  class Found(val text: String, val format: String)

  class Turned(val data: ByteArray, val width: Int, val height: Int)

  companion object {
    /** The food barcodes: what's on packaged products. */
    val FORMATS = listOf(BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128)

    fun newReader() =
      MultiFormatReader().apply {
        setHints(mapOf(DecodeHintType.POSSIBLE_FORMATS to FORMATS, DecodeHintType.TRY_HARDER to true))
      }

    /**
     * Reads a barcode from a frame of brightness values, one byte per pixel, that the camera says needs
     * turning clockwise by `rotationDegrees` to be upright. Null when there isn't one.
     */
    fun decode(reader: MultiFormatReader, luminance: ByteArray, width: Int, height: Int, rotationDegrees: Int): Found? {
      val turned = turn(luminance, width, height, rotationDegrees)
      val source = PlanarYUVLuminanceSource(turned.data, turned.width, turned.height, 0, 0, turned.width, turned.height, false)
      return try {
        val result = reader.decodeWithState(BinaryBitmap(HybridBinarizer(source)))
        Found(result.text, result.barcodeFormat.name)
      } catch (_: ReaderException) {
        // No barcode in this frame, or one that didn't check out.
        null
      } finally {
        reader.reset()
      }
    }

    /** Turns a frame clockwise by 0, 90, 180 or 270 degrees. */
    fun turn(data: ByteArray, width: Int, height: Int, degrees: Int): Turned =
      when (((degrees % 360) + 360) % 360) {
        90 -> {
          val out = ByteArray(data.size)
          for (y in 0 until height) for (x in 0 until width) out[x * height + (height - 1 - y)] = data[y * width + x]
          Turned(out, height, width)
        }
        180 -> {
          val out = ByteArray(data.size)
          for (i in data.indices) out[data.size - 1 - i] = data[i]
          Turned(out, width, height)
        }
        270 -> {
          val out = ByteArray(data.size)
          for (y in 0 until height) for (x in 0 until width) out[(width - 1 - x) * height + y] = data[y * width + x]
          Turned(out, height, width)
        }
        else -> Turned(data, width, height)
      }
  }
}
