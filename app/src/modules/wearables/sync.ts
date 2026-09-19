import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { create } from 'zustand';

import { subscribe } from '../../core/db/database';
import { useSettings } from '../../core/store/settings';
import { sleepHoursByDay } from '../../lib/wearables';
import { importBodyFat, importWeight, importWorkout, markShared, notifyImported, unsharedWeights, unsharedWorkouts, upsertWatchMarker } from './repo';
import type { HealthSource } from './types';

/** Health Connect on Android, Apple Health on iOS; each loads only on its own platform. */
export function healthSource(): HealthSource | null {
  if (Platform.OS === 'android') return (require('./healthConnect') as typeof import('./healthConnect')).healthConnect;
  if (Platform.OS === 'ios') return (require('./appleHealth') as typeof import('./appleHealth')).appleHealth;
  return null;
}

export interface SyncResult {
  days: number;
  workouts: number;
  weighIns: number;
  shared: number;
}

export const useWatchSync = create<{ syncing: boolean; error: string | null; last: SyncResult | null }>(() => ({ syncing: false, error: null, last: null }));

const DAY = 86400_000;
const FIRST_SYNC_DAYS = 30;
/** Re-read a little before the last sync so late-arriving watch data is caught. */
const OVERLAP_DAYS = 2;

function syncWindow(lastSyncedAt: string | null): { from: Date; to: Date } {
  const to = new Date();
  const back = lastSyncedAt ? Date.parse(lastSyncedAt) - OVERLAP_DAYS * DAY : to.getTime() - FIRST_SYNC_DAYS * DAY;
  const from = new Date(back);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

async function share(source: HealthSource): Promise<number> {
  let sent = 0;
  for (const w of unsharedWeights()) {
    try {
      await source.shareWeight(w.id, w.kg, w.at);
      markShared('weight_entries', w.id);
      sent++;
    } catch {
      // Write access may be off; try again next sync.
    }
  }
  for (const w of unsharedWorkouts()) {
    try {
      await source.shareWorkout(w);
      markShared(w.kind === 'strength' ? 'workouts' : 'cardio_sessions', w.id);
      sent++;
    } catch {
      // As above.
    }
  }
  return sent;
}

/** Brings in watch data since the last sync and, if chosen, sends Metakai's workouts and weigh-ins back. */
export async function syncWatch(): Promise<SyncResult | null> {
  const { watch, enabledModules, set } = useSettings.getState();
  const source = healthSource();
  if (!source || !watch.health || !enabledModules.includes('wearables') || useWatchSync.getState().syncing) return null;
  useWatchSync.setState({ syncing: true, error: null });
  try {
    const { from, to } = syncWindow(watch.lastSyncedAt);
    const result: SyncResult = { days: 0, workouts: 0, weighIns: 0, shared: 0 };
    const touched = new Set<string>();
    const mark = (day: string, changed: boolean) => changed && touched.add(day);

    if (watch.data.activity) {
      for (const [day, n] of Object.entries(await source.steps(from, to))) mark(day, upsertWatchMarker(day, 'steps', Math.round(n), 'steps'));
    }
    if (watch.data.heart) {
      for (const [day, bpm] of Object.entries(await source.restingHeartRate(from, to))) mark(day, upsertWatchMarker(day, 'rhr', bpm, 'bpm'));
      for (const [day, ms] of Object.entries(await source.hrv(from, to))) mark(day, upsertWatchMarker(day, 'hrv', ms, 'ms'));
    }
    if (watch.data.sleep) {
      // Start the evening before so the first night in the window is whole.
      const nights = sleepHoursByDay(await source.sleep(new Date(from.getTime() - DAY / 2), to));
      for (const [day, hours] of Object.entries(nights)) if (hours >= 1) mark(day, upsertWatchMarker(day, 'sleep', hours, 'h'));
    }
    if (watch.data.body) {
      for (const w of await source.weights(from, to)) if (importWeight(w)) result.weighIns++;
      for (const b of await source.bodyFat(from, to)) importBodyFat(b);
    }
    if (watch.data.workouts) {
      for (const w of await source.workouts(from, to)) if (importWorkout(w)) result.workouts++;
    }
    result.days = touched.size;
    notifyImported();
    if (watch.share) result.shared = await share(source);

    set({ watch: { ...useSettings.getState().watch, lastSyncedAt: new Date().toISOString() } });
    useWatchSync.setState({ last: result });
    return result;
  } catch (e) {
    useWatchSync.setState({ error: e instanceof Error ? e.message : 'Sync failed' });
    return null;
  } finally {
    useWatchSync.setState({ syncing: false });
  }
}

let shareTimer: ReturnType<typeof setTimeout> | null = null;

/** Syncs on launch and on return to the app, and shares new workouts and weigh-ins shortly after they're saved. */
export function useWatchAutoSync() {
  const on = useSettings((s) => s.watch.health && s.enabledModules.includes('wearables'));
  useEffect(() => {
    if (!on) return;
    syncWatch();
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncWatch();
    });
    const unwatch = subscribe(['workouts', 'cardio_sessions', 'weight_entries'], () => {
      if (!useSettings.getState().watch.share) return;
      if (shareTimer) clearTimeout(shareTimer);
      shareTimer = setTimeout(() => {
        shareTimer = null;
        const source = healthSource();
        if (source) share(source).catch(() => {});
      }, 5000);
    });
    return () => {
      app.remove();
      unwatch();
    };
  }, [on]);
}
