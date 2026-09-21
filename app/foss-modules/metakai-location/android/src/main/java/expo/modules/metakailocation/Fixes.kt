package expo.modules.metakailocation

import android.content.Context
import android.location.Location
import java.io.File

/** One GPS reading. */
data class Fix(
  val lat: Double,
  val lon: Double,
  val alt: Double?,
  val altAccuracy: Double?,
  val accuracy: Double?,
  /** Epoch milliseconds. */
  val t: Long,
) {
  fun toMap(): Map<String, Any?> = mapOf("lat" to lat, "lon" to lon, "alt" to alt, "altAccuracy" to altAccuracy, "accuracy" to accuracy, "t" to t.toDouble())

  fun toLine() = "$lat,$lon,${alt ?: ""},${altAccuracy ?: ""},${accuracy ?: ""},$t"

  companion object {
    fun from(l: Location) =
      Fix(
        lat = l.latitude,
        lon = l.longitude,
        alt = if (l.hasAltitude()) l.altitude else null,
        altAccuracy = if (l.hasVerticalAccuracy()) l.verticalAccuracyMeters.toDouble() else null,
        accuracy = if (l.hasAccuracy()) l.accuracy.toDouble() else null,
        t = l.time,
      )

    fun parse(line: String): Fix? {
      val p = line.split(',')
      if (p.size != 6) return null
      return runCatching { Fix(p[0].toDouble(), p[1].toDouble(), p[2].toDoubleOrNull(), p[3].toDoubleOrNull(), p[4].toDoubleOrNull(), p[5].toLong()) }.getOrNull()
    }
  }
}

/**
 * Where fixes go. While the app is running and listening they are delivered live. Otherwise (the app
 * was closed, or the system stopped it, while the recording service carried on) they are kept in a
 * small file and handed over the next time the app attaches, so a run isn't lost.
 */
object FixBus {
  private val lock = Any()
  private var live: ((List<Fix>) -> Unit)? = null

  private fun backlog(context: Context) = File(context.filesDir, "gps_backlog.csv")

  /** Starts live delivery and returns everything kept while nobody was listening. */
  fun attach(context: Context, listener: (List<Fix>) -> Unit): List<Fix> =
    synchronized(lock) {
      val file = backlog(context)
      val kept = if (file.exists()) runCatching { file.readLines().mapNotNull { Fix.parse(it) } }.getOrDefault(emptyList()) else emptyList()
      file.delete()
      live = listener
      kept
    }

  fun detach() = synchronized(lock) { live = null }

  /** Fixes from the recording service. */
  fun record(context: Context, fixes: List<Fix>) {
    if (fixes.isEmpty()) return
    synchronized(lock) {
      val listener = live
      if (listener != null) listener(fixes) else backlog(context).appendText(fixes.joinToString("") { it.toLine() + "\n" })
    }
  }
}
