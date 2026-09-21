package expo.modules.metakailocation

import android.content.Context
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Looper
import androidx.core.location.LocationManagerCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * GPS for the free-software build: the phone's own location service, with no Google Play services.
 * Recording runs in LocationService; while the record screen is open, a light watch shows signal strength.
 */
class MetakaiLocationModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private var watching: LocationListener? = null

  override fun definition() = ModuleDefinition {
    Name("MetakaiLocation")

    Events("onFixes", "onWatch")

    OnDestroy {
      FixBus.detach()
      stopWatching()
    }

    /** Whether location is switched on for the phone. */
    AsyncFunction("servicesEnabled") {
      val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
      LocationManagerCompat.isLocationEnabled(lm)
    }

    /**
     * Starts live delivery of fixes as events and returns the ones kept while the app wasn't listening.
     * Call once when the app starts.
     */
    AsyncFunction("attach") {
      FixBus.attach(context) { fixes -> sendEvent("onFixes", mapOf("fixes" to fixes.map { it.toMap() })) }.map { it.toMap() }
    }

    /** Starts recording in a foreground service, with a notification saying so. Safe to call again: it registers afresh. */
    AsyncFunction("start") { title: String, body: String ->
      LocationService.start(context, title, body)
    }

    AsyncFunction("stop") { LocationService.stop(context) }

    /** Lets the record screen show signal strength before a recording starts. */
    AsyncFunction("startWatch") {
      stopWatching()
      val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
      val listener =
        object : LocationListener {
          override fun onLocationChanged(location: Location) {
            sendEvent("onWatch", mapOf("fix" to Fix.from(location).toMap()))
          }

          @Deprecated("Deprecated in Java")
          override fun onStatusChanged(provider: String?, status: Int, extras: android.os.Bundle?) {}

          override fun onProviderEnabled(provider: String) {}

          override fun onProviderDisabled(provider: String) {}
        }
      try {
        lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 2000L, 0f, listener, Looper.getMainLooper())
        watching = listener
      } catch (_: SecurityException) {
        // No permission yet; the screen asks for it first.
      } catch (_: IllegalArgumentException) {
        // No GPS on this device.
      }
    }

    AsyncFunction("stopWatch") { stopWatching() }
  }

  private fun stopWatching() {
    val listener = watching ?: return
    (context.getSystemService(Context.LOCATION_SERVICE) as LocationManager).removeUpdates(listener)
    watching = null
  }
}
