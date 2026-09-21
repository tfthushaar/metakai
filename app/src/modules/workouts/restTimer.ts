import { Platform } from 'react-native';
import { create } from 'zustand';

import { cancelNotification, notificationsAllowed, scheduleNotification } from '../../core/notify';
import { haptic } from '../../ui/haptics';

let permissionAsked = false;

/** Asks for notification permission once per session, the first time a rest timer could use it. */
async function canNotify(): Promise<boolean> {
  if (await notificationsAllowed(false)) return true;
  if (permissionAsked) return false;
  permissionAsked = true;
  return notificationsAllowed(true);
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
    if (!(await canNotify())) return null;
    return await scheduleNotification({
      channel: 'rest-timer',
      title: 'Rest over',
      body: label ? `Next set: ${label}` : 'Time for your next set',
      sound: true,
      when: { kind: 'at', time: endsAt },
    });
  } catch {
    return null;
  }
}

function cancel(id: string | null) {
  if (id) cancelNotification(id);
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
