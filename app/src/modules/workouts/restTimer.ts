import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { haptic } from '../../ui/haptics';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const CHANNEL = 'rest-timer';
let channelReady = false;
let permissionAsked = false;

async function ensureChannel() {
  if (channelReady) return;
  channelReady = true;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Rest timer',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 120, 250],
  }).catch(() => {});
}

async function canNotify(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (permissionAsked || !current.canAskAgain) return false;
  permissionAsked = true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

interface RestState {
  endsAt: number | null;
  duration: number;
  label: string | null;
  notificationId: string | null;
  start: (seconds: number, label?: string) => void;
  adjust: (deltaSeconds: number) => void;
  skip: () => void;
  finish: () => void;
}

async function schedule(endsAt: number, label: string | null): Promise<string | null> {
  // The web build can't notify from the background, so the in-app timer is all it gets.
  if (Platform.OS === 'web') return null;
  try {
    await ensureChannel();
    if (!(await canNotify())) return null;
    return await Notifications.scheduleNotificationAsync({
      content: { title: 'Rest over', body: label ? `Next set: ${label}` : 'Time for your next set', sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(endsAt), channelId: CHANNEL },
    });
  } catch {
    return null;
  }
}

function cancel(id: string | null) {
  if (id) Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}

export const useRestTimer = create<RestState>((set, get) => ({
  endsAt: null,
  duration: 0,
  label: null,
  notificationId: null,
  start: (seconds, label) => {
    cancel(get().notificationId);
    const endsAt = Date.now() + seconds * 1000;
    set({ endsAt, duration: seconds, label: label ?? null, notificationId: null });
    schedule(endsAt, label ?? null).then((id) => {
      if (get().endsAt === endsAt) set({ notificationId: id });
      else cancel(id);
    });
  },
  adjust: (delta) => {
    const { endsAt, duration, label, notificationId } = get();
    if (!endsAt) return;
    const next = Math.max(Date.now() + 1000, endsAt + delta * 1000);
    cancel(notificationId);
    set({ endsAt: next, duration: Math.max(1, duration + delta), notificationId: null });
    schedule(next, label).then((id) => {
      if (get().endsAt === next) set({ notificationId: id });
      else cancel(id);
    });
  },
  skip: () => {
    cancel(get().notificationId);
    set({ endsAt: null, notificationId: null });
  },
  finish: () => {
    cancel(get().notificationId);
    set({ endsAt: null, notificationId: null });
    haptic.warning();
  },
}));
