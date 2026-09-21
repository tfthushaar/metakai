import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Local notifications (reminders, the rest timer). The standard build uses expo-notifications; the
 * free-software build replaces this whole file with notify.foss.ts, which needs no Firebase.
 */

export type NotifyChannel = 'reminders' | 'rest-timer';

/** Every day, every week on a weekday (1 is Sunday), or once at a time. */
export type NotifyWhen = { kind: 'daily'; hour: number; minute: number } | { kind: 'weekly'; weekday: number; hour: number; minute: number } | { kind: 'at'; time: number };

export interface NotifySpec {
  /** Scheduling again with the same id replaces the earlier one. */
  id?: string;
  channel: NotifyChannel;
  title: string;
  body: string;
  /** A metakai:// link opened by tapping the notification. */
  url?: string;
  sound?: boolean;
  when: NotifyWhen;
}

// While the app is open, its own screens say the same thing, so notifications stay quiet.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const CHANNELS: Record<NotifyChannel, { name: string; importance: Notifications.AndroidImportance; vibrationPattern?: number[] }> = {
  reminders: { name: 'Reminders', importance: Notifications.AndroidImportance.DEFAULT },
  'rest-timer': { name: 'Rest timer', importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 250, 120, 250] },
};
const channelsReady = new Set<NotifyChannel>();

async function ensureChannel(channel: NotifyChannel) {
  if (channelsReady.has(channel)) return;
  channelsReady.add(channel);
  await Notifications.setNotificationChannelAsync(channel, CHANNELS[channel]).catch(() => {});
}

/** Whether notifications can be posted; with `ask`, asks once if the system still lets us. */
export async function notificationsAllowed(ask = true): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!ask || !current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** Schedules a notification and returns its id. */
export async function scheduleNotification(spec: NotifySpec): Promise<string> {
  await ensureChannel(spec.channel);
  const w = spec.when;
  const trigger: Notifications.NotificationTriggerInput =
    w.kind === 'weekly'
      ? { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: w.weekday, hour: w.hour, minute: w.minute, channelId: spec.channel }
      : w.kind === 'daily'
        ? { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: w.hour, minute: w.minute, channelId: spec.channel }
        : { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(w.time), channelId: spec.channel };
  return Notifications.scheduleNotificationAsync({
    ...(spec.id ? { identifier: spec.id } : {}),
    content: { title: spec.title, body: spec.body, ...(spec.url ? { data: { url: spec.url } } : {}), ...(spec.sound ? { sound: true } : {}) },
    trigger,
  });
}

export async function cancelNotification(id: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}

/** Calls `handler` with the link of a notification the user taps. Returns a function that stops listening. */
export function onNotificationOpened(handler: (url: string) => void): () => void {
  if (Platform.OS === 'web') return () => {};
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const url = response.notification.request.content.data?.url;
    if (typeof url === 'string' && url.startsWith('metakai://')) handler(url);
  });
  return () => sub.remove();
}
