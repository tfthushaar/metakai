import { getDb, newId, notify, nowIso } from '../../core/db/database';
import { cardioCalories } from '../../lib/cardio';
import { addDays, dateKey } from '../../lib/dates';
import type { MarkerKind } from '../health/repo';
import type { ImportedReading, ImportedWorkout, SharedWorkout } from './types';

/** Rows written from a watch or health app carry this source. */
export const WATCH = 'watch';

/**
 * Daily watch readings: one row per kind and day, updated as the day's total grows.
 * A row the user deleted stays deleted.
 */
export function upsertWatchMarker(day: string, kind: MarkerKind, value: number, unit: string): boolean {
  const db = getDb();
  const row = db.getFirstSync<{ id: string; value: number; deleted_at: string | null }>(
    'SELECT id, value, deleted_at FROM health_markers WHERE kind = ? AND date_key = ? AND source = ? LIMIT 1',
    [kind, day, WATCH],
  );
  const now = nowIso();
  if (row) {
    if (row.deleted_at || row.value === value) return false;
    db.runSync('UPDATE health_markers SET value = ?, updated_at = ? WHERE id = ?', [value, now, row.id]);
  } else {
    db.runSync('INSERT INTO health_markers (id, date_key, kind, value, unit, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
      newId(),
      day,
      kind,
      value,
      unit,
      WATCH,
      now,
      now,
    ]);
  }
  return true;
}

const seen = (table: 'weight_entries' | 'body_comp_entries' | 'cardio_sessions', externalId: string) =>
  getDb().getFirstSync<{ id: string }>(`SELECT id FROM ${table} WHERE external_id = ? LIMIT 1`, [externalId]) != null;

/** Weigh-ins from a smart scale or another app. Each one arrives once, even if deleted here later. */
export function importWeight(r: ImportedReading): boolean {
  if (r.value < 20 || r.value > 400 || seen('weight_entries', r.externalId)) return false;
  const now = nowIso();
  getDb().runSync(
    'INSERT INTO weight_entries (id, date_key, measured_at, kg, source, external_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [newId(), dateKey(new Date(r.at)), new Date(r.at).toISOString(), Math.round(r.value * 100) / 100, WATCH, r.externalId, now, now],
  );
  return true;
}

export function importBodyFat(r: ImportedReading): boolean {
  if (r.value < 2 || r.value > 70 || seen('body_comp_entries', r.externalId)) return false;
  const now = nowIso();
  getDb().runSync(
    "INSERT INTO body_comp_entries (id, date_key, method, bf_pct, data, external_id, created_at, updated_at) VALUES (?, ?, 'scale', ?, '{}', ?, ?, ?)",
    [newId(), dateKey(new Date(r.at)), Math.round(r.value * 10) / 10, r.externalId, now, now],
  );
  return true;
}

function latestKg(): number {
  return getDb().getFirstSync<{ kg: number }>('SELECT kg FROM weight_entries WHERE deleted_at IS NULL ORDER BY measured_at DESC LIMIT 1')?.kg ?? 75;
}

/** Runs, rides, walks and other cardio recorded on a watch. */
export function importWorkout(w: ImportedWorkout): boolean {
  const durationMin = Math.round(((w.end - w.start) / 60000) * 10) / 10;
  if (durationMin < 1 || seen('cardio_sessions', w.externalId)) return false;
  const kcal = w.kcal ?? Math.round(cardioCalories({ kind: w.kind, durationMin, distanceKm: w.distanceKm, bodyweightKg: latestKg() }));
  const now = nowIso();
  getDb().runSync(
    `INSERT INTO cardio_sessions (id, date_key, kind, duration_min, distance_km, avg_hr, max_hr, kcal, note, title, source, external_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId(),
      dateKey(new Date(w.start)),
      w.kind,
      durationMin,
      w.distanceKm,
      w.avgHr,
      w.maxHr,
      kcal,
      w.origin ? `From ${w.origin}` : null,
      w.title,
      WATCH,
      w.externalId,
      now,
      now,
    ],
  );
  return true;
}

export function notifyImported() {
  notify('health_markers', 'weight_entries', 'body_comp_entries', 'cardio_sessions');
}

/** Metakai's own weigh-ins from the last month that haven't been sent to the health app yet. */
export function unsharedWeights(): { id: string; kg: number; at: number }[] {
  return getDb()
    .getAllSync<{ id: string; kg: number; measured_at: string }>(
      "SELECT id, kg, measured_at FROM weight_entries WHERE deleted_at IS NULL AND shared_at IS NULL AND source != 'watch' AND date_key >= ?",
      [addDays(dateKey(), -30)],
    )
    .map((r) => ({ id: r.id, kg: r.kg, at: Date.parse(r.measured_at) }));
}

/** Finished gym sessions and Metakai cardio from the last month, not yet sent. */
export function unsharedWorkouts(): SharedWorkout[] {
  const db = getDb();
  const since = addDays(dateKey(), -30);
  const lifts = db
    .getAllSync<{ id: string; name: string; started_at: string; ended_at: string; kcal: number | null }>(
      'SELECT id, name, started_at, ended_at, kcal FROM workouts WHERE deleted_at IS NULL AND ended_at IS NOT NULL AND shared_at IS NULL AND date_key >= ?',
      [since],
    )
    .map((r): SharedWorkout => ({ id: r.id, kind: 'strength', title: r.name, start: Date.parse(r.started_at), end: Date.parse(r.ended_at), kcal: r.kcal, distanceKm: null }));
  const cardio = db
    .getAllSync<{ id: string; kind: SharedWorkout['kind']; title: string | null; created_at: string; duration_min: number; elapsed_min: number | null; kcal: number | null; distance_km: number | null }>(
      'SELECT id, kind, title, created_at, duration_min, elapsed_min, kcal, distance_km FROM cardio_sessions WHERE deleted_at IS NULL AND shared_at IS NULL AND source IS NULL AND date_key >= ?',
      [since],
    )
    .map((r): SharedWorkout => {
      // Logged when it ended; recordings also know their paused time.
      const end = Date.parse(r.created_at);
      return { id: r.id, kind: r.kind, title: r.title ?? 'Cardio', start: end - (r.elapsed_min ?? r.duration_min) * 60000, end, kcal: r.kcal, distanceKm: r.distance_km };
    });
  return [...lifts, ...cardio];
}

export function markShared(table: 'weight_entries' | 'workouts' | 'cardio_sessions', id: string) {
  // Leaves updated_at alone so Drive sync doesn't treat this as an edit.
  getDb().runSync(`UPDATE ${table} SET shared_at = ? WHERE id = ?`, [nowIso(), id]);
}

/** Heart rate from a Bluetooth sensor, saved with the workout or recording it was worn for. */
export function saveHeartRate(table: 'workouts' | 'cardio_sessions', id: string, stats: { avg: number; max: number }) {
  getDb().runSync(`UPDATE ${table} SET avg_hr = ?, max_hr = ?, updated_at = ? WHERE id = ?`, [stats.avg, stats.max, nowIso(), id]);
  notify(table);
}

/** Today's watch numbers for the Today card. */
export function todayActivity(day = dateKey()): { steps: number | null; sleep: number | null; rhr: number | null } {
  const rows = getDb().getAllSync<{ kind: string; value: number }>(
    "SELECT kind, value FROM health_markers WHERE deleted_at IS NULL AND date_key = ? AND kind IN ('steps', 'sleep', 'rhr') ORDER BY updated_at DESC",
    [day],
  );
  const pick = (k: string) => rows.find((r) => r.kind === k)?.value ?? null;
  return { steps: pick('steps'), sleep: pick('sleep'), rhr: pick('rhr') };
}

/** Last night's sleep from the watch, for pre-filling the readiness check-in. */
export function watchSleep(day: string): number | null {
  return (
    getDb().getFirstSync<{ value: number }>("SELECT value FROM health_markers WHERE deleted_at IS NULL AND kind = 'sleep' AND date_key = ? AND source = ? LIMIT 1", [
      day,
      WATCH,
    ])?.value ?? null
  );
}
