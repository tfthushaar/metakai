package expo.modules.metakainotify

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** An alarm went off: post the notification, then arm the next one for a repeating reminder. */
class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val id = intent.getStringExtra(Scheduler.EXTRA_ID) ?: return
    val spec = Scheduler.load(context, id) ?: return
    if (!AppState.inForeground) Notifier.show(context, spec)
    if (spec.kind == "at") Scheduler.forget(context, id) else if (!Scheduler.arm(context, spec)) Scheduler.forget(context, id)
  }
}
