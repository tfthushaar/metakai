package expo.modules.metakainotify

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/** Builds and posts the notifications, and creates their channels. */
object Notifier {
  private const val ACCENT = 0xFFFF453A.toInt()

  private class ChannelDef(val name: String, val importance: Int, val vibration: LongArray?)

  private val channels = mapOf(
    "reminders" to ChannelDef("Reminders", NotificationManager.IMPORTANCE_DEFAULT, null),
    "rest-timer" to ChannelDef("Rest timer", NotificationManager.IMPORTANCE_HIGH, longArrayOf(0, 250, 120, 250)),
  )

  private fun ensureChannel(context: Context, id: String) {
    val def = channels[id] ?: return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(id) != null) return
    manager.createNotificationChannel(
      NotificationChannel(id, def.name, def.importance).apply {
        if (def.vibration != null) {
          enableVibration(true)
          vibrationPattern = def.vibration
        }
      },
    )
  }

  fun show(context: Context, spec: ScheduleSpec) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) return
    ensureChannel(context, spec.channel)

    // Tapping opens the link (which the app's router understands) or, without one, the app.
    val open =
      if (spec.url.isNotEmpty()) Intent(Intent.ACTION_VIEW, Uri.parse(spec.url)).setPackage(context.packageName)
      else context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
    open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    val tap = PendingIntent.getActivity(context, spec.id.hashCode(), open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    val notification =
      NotificationCompat.Builder(context, spec.channel)
        .setSmallIcon(R.drawable.ic_stat_metakai)
        .setColor(ACCENT)
        .setContentTitle(spec.title)
        .setContentText(spec.body)
        .setStyle(NotificationCompat.BigTextStyle().bigText(spec.body))
        .setContentIntent(tap)
        .setAutoCancel(true)
        .setPriority(if (spec.channel == "rest-timer") NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
        .setCategory(if (spec.channel == "rest-timer") NotificationCompat.CATEGORY_ALARM else NotificationCompat.CATEGORY_REMINDER)
        .build()
    NotificationManagerCompat.from(context).notify(spec.id.hashCode(), notification)
  }
}
