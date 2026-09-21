import { cancelNotification, notificationsAllowed, scheduleNotification } from './notify';
import { useSettings, type Reminder, type ReminderId } from './store/settings';

const CONTENT: Record<ReminderId, { title: string; body: string; url: string }> = {
  weighIn: { title: 'Morning weigh-in', body: 'Step on the scale before breakfast.', url: 'metakai://log-weight' },
  logFood: { title: 'Log today’s food', body: 'Anything missing from today? It takes a sentence.', url: 'metakai://log-food' },
  photos: { title: 'Progress photo day', body: 'Front, side and back, same spot as last time.', url: 'metakai://photos' },
};

const identifier = (id: ReminderId) => `reminder-${id}`;

/** Re-schedules every reminder from settings. Returns false if notifications are not permitted. */
export async function syncReminders(): Promise<boolean> {
  const reminders = useSettings.getState().reminders;
  const anyOn = Object.values(reminders).some((r) => r.on);

  for (const id of Object.keys(CONTENT) as ReminderId[]) await cancelNotification(identifier(id));
  if (!anyOn) return true;
  if (!(await notificationsAllowed(true))) return false;

  for (const [id, r] of Object.entries(reminders) as [ReminderId, Reminder][]) {
    if (!r.on) continue;
    await scheduleNotification({
      id: identifier(id),
      channel: 'reminders',
      title: CONTENT[id].title,
      body: CONTENT[id].body,
      url: CONTENT[id].url,
      when: r.weekday != null ? { kind: 'weekly', weekday: r.weekday, hour: r.hour, minute: r.minute } : { kind: 'daily', hour: r.hour, minute: r.minute },
    });
  }
  return true;
}
