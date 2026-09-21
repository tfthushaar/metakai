package expo.modules.metakainotify

import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/** A notification to schedule. See Scheduler for how `kind` is read. */
class ScheduleSpec : Record {
  @Field var id: String = ""
  @Field var channel: String = "reminders"
  @Field var title: String = ""
  @Field var body: String = ""
  /** A metakai:// link opened when the notification is tapped, or empty to just open the app. */
  @Field var url: String = ""
  @Field var sound: Boolean = false
  /** "at" (once, at `at`), "daily" or "weekly". */
  @Field var kind: String = "at"
  /** Epoch milliseconds, for "at". */
  @Field var at: Double = 0.0
  @Field var hour: Int = 0
  @Field var minute: Int = 0
  /** 1 is Sunday, as in java.util.Calendar. */
  @Field var weekday: Int = 1
}

/**
 * Local notifications for the free-software build, from the system's own alarm clock. No Firebase and
 * no Google Play services: the alarm wakes a receiver, which posts the notification and sets the next one.
 */
class MetakaiNotifyModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("MetakaiNotify")

    OnCreate {
      AppState.inForeground = appContext.currentActivity != null
    }
    OnActivityEntersForeground { AppState.inForeground = true }
    OnActivityEntersBackground { AppState.inForeground = false }

    /** Whether the app may post notifications (on Android 13 and up, whether the permission was granted). */
    AsyncFunction("areEnabled") { NotificationManagerCompat.from(context).areNotificationsEnabled() }

    AsyncFunction("schedule") { spec: ScheduleSpec -> Scheduler.schedule(context, spec) }

    AsyncFunction("cancel") { id: String -> Scheduler.cancel(context, id) }

    AsyncFunction("cancelAll") { Scheduler.cancelAll(context) }
  }
}
