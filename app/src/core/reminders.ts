import * as Notifications from 'expo-notifications';

import { useSettings, type Reminder, type ReminderId } from './store/settings';

const CHANNEL = 'reminders';

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

  for (const id of Object.keys(CONTENT) as ReminderId[]) {
    await Notifications.cancelScheduledNotificationAsync(identifier(id)).catch(() => {});
  }
  if (!anyOn) return true;

  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return false;

  await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Reminders', importance: Notifications.AndroidImportance.DEFAULT }).catch(() => {});

  for (const [id, r] of Object.entries(reminders) as [ReminderId, Reminder][]) {
    if (!r.on) continue;
    const trigger: Notifications.NotificationTriggerInput =
      r.weekday != null
        ? { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: r.weekday, hour: r.hour, minute: r.minute, channelId: CHANNEL }
        : { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: r.hour, minute: r.minute, channelId: CHANNEL };
    await Notifications.scheduleNotificationAsync({
      identifier: identifier(id),
      content: { title: CONTENT[id].title, body: CONTENT[id].body, data: { url: CONTENT[id].url } },
      trigger,
    });
  }
  return true;
}
