import { randomUUID } from 'expo-crypto';
import { PermissionsAndroid, Platform } from 'react-native';

import Native from '../../foss-modules/metakai-notify/src';
import type { NotifySpec } from './notify';

/**
 * Local notifications in the free-software build: the system's alarm clock through the metakai-notify
 * module, with no Firebase or Google Play services. Replaces notify.ts.
 */

export type { NotifyChannel, NotifySpec, NotifyWhen } from './notify';

/** Whether notifications can be posted; with `ask`, asks for the permission Android 13 and up requires. */
export async function notificationsAllowed(ask = true): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  if (await Native.areEnabled()) return true;
  // Before Android 13 there is nothing to ask: notifications are switched off in the system settings.
  if (!ask || Number(Platform.Version) < 33) return false;
  return (await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)) === PermissionsAndroid.RESULTS.GRANTED;
}

/** Schedules a notification and returns its id. */
export async function scheduleNotification(spec: NotifySpec): Promise<string> {
  const id = spec.id ?? randomUUID();
  const w = spec.when;
  await Native.schedule({
    id,
    channel: spec.channel,
    title: spec.title,
    body: spec.body,
    url: spec.url ?? '',
    sound: !!spec.sound,
    kind: w.kind,
    at: w.kind === 'at' ? w.time : 0,
    hour: w.kind === 'at' ? 0 : w.hour,
    minute: w.kind === 'at' ? 0 : w.minute,
    weekday: w.kind === 'weekly' ? w.weekday : 1,
  });
  return id;
}

export async function cancelNotification(id: string): Promise<void> {
  await Native.cancel(id).catch(() => {});
}

/**
 * Tapping a notification opens its metakai:// link, which the router follows by itself, so there is
 * nothing to listen for here.
 */
export function onNotificationOpened(_handler: (url: string) => void): () => void {
  return () => {};
}
