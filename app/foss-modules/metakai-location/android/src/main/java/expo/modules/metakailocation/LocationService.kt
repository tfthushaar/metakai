package expo.modules.metakailocation

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.NotificationCompat

/**
 * Records GPS fixes while a run, ride or walk is being recorded. It is a foreground service, so
 * Android keeps it (and the app's process) alive with the screen off, and says so in a notification.
 * Fixes come straight from the phone's GPS through the platform LocationManager, not from Google Play services.
 */
class LocationService : Service() {
  private var manager: LocationManager? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private val listener =
    object : LocationListener {
      override fun onLocationChanged(location: Location) = FixBus.record(applicationContext, listOf(Fix.from(location)))

      override fun onLocationChanged(locations: MutableList<Location>) = FixBus.record(applicationContext, locations.map { Fix.from(it) })

      @Deprecated("Deprecated in Java")
      override fun onStatusChanged(provider: String?, status: Int, extras: android.os.Bundle?) {}

      override fun onProviderEnabled(provider: String) {}

      override fun onProviderDisabled(provider: String) {}
    }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    // The system restarts a killed service without its intent: carry on with what was saved, if a recording is still on.
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: prefs.getString(EXTRA_TITLE, null)
    val body = intent?.getStringExtra(EXTRA_BODY) ?: prefs.getString(EXTRA_BODY, "") ?: ""
    if (title == null || !prefs.getBoolean(ACTIVE, false) && intent == null) {
      stopSelf()
      return START_NOT_STICKY
    }
    try {
      startInForeground(title, body)
    } catch (_: SecurityException) {
      // Location permission was taken away since the recording began: nothing to record.
      stopSelf()
      return START_NOT_STICKY
    }
    // Started by the app (it is on screen): register afresh. A service the system restarted on its own
    // may not be allowed to see location until the app is visible again, so it can't be trusted as is.
    if (intent != null) end()
    begin()
    return START_STICKY
  }

  private fun startInForeground(title: String, body: String) {
    val notifications = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (notifications.getNotificationChannel(CHANNEL) == null) {
      notifications.createNotificationChannel(NotificationChannel(CHANNEL, "Recording", NotificationManager.IMPORTANCE_LOW))
    }
    val open = packageManager.getLaunchIntentForPackage(packageName)
    val tap = open?.let { PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT) }
    val notification: Notification =
      NotificationCompat.Builder(this, CHANNEL)
        .setSmallIcon(R.drawable.ic_stat_metakai)
        .setColor(0xFFFF453A.toInt())
        .setContentTitle(title)
        .setContentText(body)
        .setContentIntent(tap)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setCategory(NotificationCompat.CATEGORY_WORKOUT)
        .build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun begin() {
    if (manager != null) return
    val lm = getSystemService(Context.LOCATION_SERVICE) as LocationManager
    if (wakeLock == null) {
      val power = getSystemService(Context.POWER_SERVICE) as PowerManager
      wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "metakai:recording").apply { acquire(12 * 60 * 60 * 1000L) }
    }
    try {
      lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, UPDATE_MS, 0f, listener, Looper.getMainLooper())
      manager = lm
    } catch (_: SecurityException) {
      // Location permission was taken away: nothing to record.
      stopSelf()
    } catch (_: IllegalArgumentException) {
      // No GPS on this device.
      stopSelf()
    }
  }

  private fun end() {
    manager?.removeUpdates(listener)
    manager = null
  }

  override fun onDestroy() {
    end()
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
    super.onDestroy()
  }

  companion object {
    const val PREFS = "metakai_location"
    const val ACTIVE = "active"
    const val EXTRA_TITLE = "title"
    const val EXTRA_BODY = "body"
    private const val CHANNEL = "recording"
    private const val NOTIFICATION_ID = 4711
    private const val UPDATE_MS = 2000L

    fun start(context: Context, title: String, body: String) {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(ACTIVE, true).putString(EXTRA_TITLE, title).putString(EXTRA_BODY, body).apply()
      val intent = Intent(context, LocationService::class.java).putExtra(EXTRA_TITLE, title).putExtra(EXTRA_BODY, body)
      try {
        context.startForegroundService(intent)
      } catch (e: RuntimeException) {
        // Android wouldn't let a foreground service start (the app isn't on screen): don't claim to be recording.
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(ACTIVE, false).apply()
        throw e
      }
    }

    fun stop(context: Context) {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(ACTIVE, false).apply()
      context.stopService(Intent(context, LocationService::class.java))
    }
  }
}
