package expo.modules.metakainotify

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Alarms don't survive a reboot or an update, and shift with the clock: set them all again. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    Scheduler.rearmAll(context)
  }
}
