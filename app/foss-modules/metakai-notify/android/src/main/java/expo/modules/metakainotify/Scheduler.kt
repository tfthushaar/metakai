package expo.modules.metakainotify

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONObject
import java.util.Calendar

/** Whether the app is on screen. Notifications stay quiet then: the screen already says it. */
object AppState {
  @Volatile
  var inForeground = false
}

/**
 * Keeps scheduled notifications in SharedPreferences and arms one alarm for each. Repeating ones are
 * armed for their next time only, and again when they fire, so daylight saving and time zone changes
 * (and reboots, see BootReceiver) can't drift them.
 */
object Scheduler {
  private const val PREFS = "metakai_notify"
  const val EXTRA_ID = "id"

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun alarms(context: Context) = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

  private fun pending(context: Context, id: String): PendingIntent {
    val intent = Intent(context, AlarmReceiver::class.java).setAction("expo.modules.metakainotify.ALARM").putExtra(EXTRA_ID, id)
    return PendingIntent.getBroadcast(context, id.hashCode(), intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  private fun toJson(s: ScheduleSpec) =
    JSONObject()
      .put("id", s.id).put("channel", s.channel).put("title", s.title).put("body", s.body).put("url", s.url)
      .put("sound", s.sound).put("kind", s.kind).put("at", s.at).put("hour", s.hour).put("minute", s.minute).put("weekday", s.weekday)

  private fun fromJson(j: JSONObject) =
    ScheduleSpec().apply {
      id = j.getString("id"); channel = j.optString("channel", "reminders"); title = j.optString("title"); body = j.optString("body")
      url = j.optString("url"); sound = j.optBoolean("sound"); kind = j.optString("kind", "at"); at = j.optDouble("at", 0.0)
      hour = j.optInt("hour"); minute = j.optInt("minute"); weekday = j.optInt("weekday", 1)
    }

  fun load(context: Context, id: String): ScheduleSpec? = prefs(context).getString(id, null)?.let { runCatching { fromJson(JSONObject(it)) }.getOrNull() }

  fun schedule(context: Context, spec: ScheduleSpec) {
    require(spec.id.isNotEmpty()) { "A notification needs an id." }
    prefs(context).edit().putString(spec.id, toJson(spec).toString()).apply()
    if (!arm(context, spec)) forget(context, spec.id)
  }

  fun cancel(context: Context, id: String) {
    alarms(context).cancel(pending(context, id))
    forget(context, id)
  }

  fun cancelAll(context: Context) {
    for (id in prefs(context).all.keys) alarms(context).cancel(pending(context, id))
    prefs(context).edit().clear().apply()
  }

  fun forget(context: Context, id: String) {
    prefs(context).edit().remove(id).apply()
  }

  /** Re-arms everything saved: after a reboot, an app update, or the clock or time zone changing. */
  fun rearmAll(context: Context) {
    for (raw in prefs(context).all.values) {
      val spec = (raw as? String)?.let { runCatching { fromJson(JSONObject(it)) }.getOrNull() } ?: continue
      if (!arm(context, spec)) forget(context, spec.id)
    }
  }

  /** Sets the alarm for the next time this notification is due. False when there isn't one (a one-off in the past). */
  fun arm(context: Context, spec: ScheduleSpec, now: Long = System.currentTimeMillis()): Boolean {
    val at = nextTime(spec, now) ?: return false
    val manager = alarms(context)
    val pending = pending(context, spec.id)
    val exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || manager.canScheduleExactAlarms()
    try {
      if (exact) manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending) else manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
    } catch (_: SecurityException) {
      // Exact alarms were switched off after we checked.
      manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
    }
    return true
  }

  /** The next time after `now` this is due, or null for a one-off that has passed. */
  fun nextTime(spec: ScheduleSpec, now: Long): Long? {
    if (spec.kind == "at") return spec.at.toLong().takeIf { it > now }
    val cal = Calendar.getInstance().apply {
      timeInMillis = now
      set(Calendar.HOUR_OF_DAY, spec.hour)
      set(Calendar.MINUTE, spec.minute)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }
    // add() keeps the wall-clock time across daylight saving changes.
    while (cal.timeInMillis <= now || (spec.kind == "weekly" && cal.get(Calendar.DAY_OF_WEEK) != spec.weekday)) cal.add(Calendar.DAY_OF_MONTH, 1)
    return cal.timeInMillis
  }
}
