import { isAvailable, type ModuleId } from './features/registry';
import { cancelNotification, notificationsAllowed, scheduleNotification } from './notify';
import { DEFAULT_REMINDERS, REMINDER_FEATURE, REMINDER_IDS, notificationId, slotKeys, slotsFor, type ReminderId } from '../lib/reminders';
import { useSettings } from './store/settings';

/** What each reminder says, and the screen tapping it opens (`metakai://` opens Today). */
export const CONTENT: Record<ReminderId, { title: string; body: string; url: string }> = {
  weighIn: { title: 'Morning weigh-in', body: 'Step on the scale before breakfast.', url: 'metakai://log-weight' },
  logFood: { title: 'Log today’s food', body: 'Anything missing from today? It takes a sentence.', url: 'metakai://log-food' },
  photos: { title: 'Progress photo day', body: 'Front, side and back, same spot as last time.', url: 'metakai://photos' },
  workout: { title: 'Time to train', body: 'Your workout is ready when you are.', url: 'metakai://start-workout' },
  checkIn: { title: 'Morning check-in', body: 'How ready do you feel today? It takes 30 seconds.', url: 'metakai://recovery' },
  review: { title: 'Weekly check-in', body: 'See how your week went and adjust your targets.', url: 'metakai://checkin' },
  water: { title: 'Time for water', body: 'A glass now keeps you on track.', url: 'metakai://' },
  supplements: { title: 'Supplements', body: 'Take today’s supplements and tick them off.', url: 'metakai://health' },
  habits: { title: 'Habits', body: 'Tick off what you’ve done today.', url: 'metakai://habits' },
};

/** Whether a reminder is on offer: the feature it belongs to, if any, is switched on. */
export function reminderOffered(id: ReminderId, enabledModules: ModuleId[]): boolean {
  const feature = REMINDER_FEATURE[id];
  return !feature || (isAvailable(feature) && enabledModules.includes(feature));
}

async function sync(): Promise<boolean> {
  const { reminders, enabledModules } = useSettings.getState();
  const active = REMINDER_IDS.filter((id) => (reminders[id] ?? DEFAULT_REMINDERS[id]).on && reminderOffered(id, enabledModules));

  // Clear everything first, so a new time, fewer days or a feature switched off leaves nothing behind.
  for (const id of REMINDER_IDS) for (const key of slotKeys(id)) await cancelNotification(notificationId(id, key));
  if (!active.length) return true;
  if (!(await notificationsAllowed(true))) return false;

  for (const id of active) {
    const { title, body, url } = CONTENT[id];
    for (const slot of slotsFor(id, { ...DEFAULT_REMINDERS[id], ...reminders[id] })) {
      await scheduleNotification({ id: notificationId(id, slot.key), channel: 'reminders', title, body, url, when: slot.when });
    }
  }
  return true;
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Schedules every reminder that is on, from settings, and clears the rest. Returns false if notifications are
 * not permitted. Runs one at a time, so a change made while another is being applied can't tangle with it.
 */
export function syncReminders(): Promise<boolean> {
  const run = queue.then(sync, sync);
  queue = run.catch(() => {});
  return run;
}
