import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { create } from 'zustand';

import { subscribe } from '../../core/db/database';
import { useSettings, type WatchSourceKind } from '../../core/store/settings';
import { dateKey } from '../../lib/dates';
import { dailyAverageFrom, sleepNights } from '../../lib/wearables';
import {
  importBodyFat,
  importWeight,
  importWorkout,
  markShared,
  notifyImported,
  saveHeartRate,
  sessionsWithoutHeartRate,
  unsharedWeights,
  unsharedWorkouts,
  upsertSleepNight,
  upsertWatchMarker,
} from './repo';
import type { HealthSource, WatchMetric } from './types';

/** Health Connect on Android, Apple Health on iOS; each loads only on its own platform. */
export function healthSource(): HealthSource | null {
  if (Platform.OS === 'android') return (require('./healthConnect') as typeof import('./healthConnect')).healthConnect;
  if (Platform.OS === 'ios') return (require('./appleHealth') as typeof import('./appleHealth')).appleHealth;
  return null;
}

export interface SyncResult {
  days: number;
  workouts: number;
  /** Watch workouts matched to sessions already logged in Metakai. */
  linked: number;
  weighIns: number;
  shared: number;
}

export const useWatchSync = create<{ syncing: boolean; error: string | null; last: SyncResult | null }>(() => ({ syncing: false, error: null, last: null }));

const DAY = 86400_000;
const FIRST_SYNC_DAYS = 30;
/** Re-read a little before the last sync so late-arriving watch data is caught. */
const OVERLAP_DAYS = 2;

const HEART: { metric: WatchMetric; unit: string }[] = [
  { metric: 'rhr', unit: 'bpm' },
  { metric: 'hrv', unit: 'ms' },
  { metric: 'vo2max', unit: 'ml/kg/min' },
  { metric: 'spo2', unit: '%' },
  { metric: 'resp', unit: 'br/min' },
];

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

/**
 * Brings in watch data since the last sync (or the last month with `full`) and, if chosen, sends
 * Metakai's workouts and weigh-ins back.
 */
export async function syncWatch({ full = false } = {}): Promise<SyncResult | null> {
  const { watch, enabledModules, set } = useSettings.getState();
  const source = healthSource();
  if (!source || !watch.health || !enabledModules.includes('wearables') || useWatchSync.getState().syncing) return null;
  useWatchSync.setState({ syncing: true, error: null });
  try {
    const { from, to } = syncWindow(full ? null : watch.lastSyncedAt);
    const result: SyncResult = { days: 0, workouts: 0, linked: 0, weighIns: 0, shared: 0 };
    const touched = new Set<string>();
    const mark = (day: string, changed: boolean) => changed && touched.add(day);
    const seen: Record<WatchSourceKind, Set<string>> = { sleep: new Set(watch.seen.sleep), heart: new Set(watch.seen.heart) };

    if (watch.data.activity) {
      for (const [day, n] of Object.entries(await source.steps(from, to))) mark(day, upsertWatchMarker(day, 'steps', Math.round(n), 'steps'));
      for (const [day, kcal] of Object.entries(await source.activeCalories(from, to))) mark(day, upsertWatchMarker(day, 'active_kcal', kcal, 'kcal'));
    }
    if (watch.data.heart) {
      for (const { metric, unit } of HEART) {
        const samples = await source.readings(metric, from, to);
        for (const s of samples) if (s.origin) seen.heart.add(s.origin);
        for (const [day, d] of Object.entries(dailyAverageFrom(samples, watch.sources.heart))) mark(day, upsertWatchMarker(day, metric, d.value, unit, d.origin));
      }
    }
    if (watch.data.sleep) {
      // Start the evening before so the first night in the window is whole.
      const sessions = await source.sleep(new Date(from.getTime() - DAY / 2), to);
      for (const s of sessions) if (s.origin) seen.sleep.add(s.origin);
      const first = dateKey(from);
      for (const night of sleepNights(sessions, watch.sources.sleep)) {
        if (night.dateKey < first || night.asleepMin < 60) continue;
        upsertSleepNight(night);
        mark(night.dateKey, upsertWatchMarker(night.dateKey, 'sleep', Math.round(night.asleepMin / 6) / 10, 'h', night.origin));
      }
    }
    if (watch.data.body) {
      for (const w of await source.weights(from, to)) if (importWeight(w)) result.weighIns++;
      for (const b of await source.bodyFat(from, to)) importBodyFat(b);
    }
    if (watch.data.workouts) {
      for (const w of await source.workouts(from, to)) {
        const r = importWorkout(w);
        if (r === 'added') result.workouts++;
        if (r === 'linked') result.linked++;
      }
    }
    if (watch.data.heart) {
      // Heart rate for gym sessions and recordings done here while wearing the watch.
      for (const s of sessionsWithoutHeartRate(dateKey(from))) {
        const hr = await source.heartRate(s.start, s.end);
        if (hr && hr.avg > 30) saveHeartRate(s.table, s.id, hr, true);
      }
    }
    result.days = touched.size;
    notifyImported();
    if (watch.share) result.shared = await share(source);

    const latest = useSettings.getState().watch;
    set({ watch: { ...latest, lastSyncedAt: new Date().toISOString(), seen: { sleep: [...seen.sleep].slice(0, 12), heart: [...seen.heart].slice(0, 12) } } });
    useWatchSync.setState({ last: result });
    return result;
  } catch (e) {
    useWatchSync.setState({ error: e instanceof Error ? e.message : 'Sync failed' });
    return null;
  } finally {
    useWatchSync.setState({ syncing: false });
  }
}

/** Chooses which app sleep or heart readings come from, and re-reads the last month with it. */
export function setWatchSource(kind: WatchSourceKind, origin: string | null) {
  const { watch, set } = useSettings.getState();
  set({ watch: { ...watch, sources: { ...watch.sources, [kind]: origin } } });
  return syncWatch({ full: true });
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
