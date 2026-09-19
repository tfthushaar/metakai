import { getDb, newId, notify, nowIso } from '../../core/db/database';
import { cardioCalories } from '../../lib/cardio';
import { addDays, dateKey } from '../../lib/dates';
import type { SleepNight } from '../../lib/wearables';
import type { MarkerKind } from '../health/repo';
import type { ImportedReading, ImportedWorkout, SharedWorkout } from './types';

/** Rows written from a watch or health app carry this source. */
export const WATCH = 'watch';

/**
 * Daily watch readings: one row per kind and day, updated as the day's total grows.
 * A row the user deleted stays deleted.
 */
export function upsertWatchMarker(day: string, kind: MarkerKind, value: number, unit: string, origin: string | null = null): boolean {
  const db = getDb();
  const row = db.getFirstSync<{ id: string; value: number; origin: string | null; deleted_at: string | null }>(
    'SELECT id, value, origin, deleted_at FROM health_markers WHERE kind = ? AND date_key = ? AND source = ? ORDER BY updated_at DESC LIMIT 1',
    [kind, day, WATCH],
  );
  const now = nowIso();
  if (row) {
    if (row.deleted_at || (row.value === value && row.origin === origin)) return false;
    db.runSync('UPDATE health_markers SET value = ?, origin = ?, updated_at = ? WHERE id = ?', [value, origin, now, row.id]);
  } else {
    db.runSync('INSERT INTO health_markers (id, date_key, kind, value, unit, source, origin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      newId(),
      day,
      kind,
      value,
      unit,
      WATCH,
      origin,
      now,
      now,
    ]);
  }
  return true;
}

/* ---------------- sleep ---------------- */

export interface StoredNight {
  dateKey: string;
  asleepMin: number;
  deepMin: number | null;
  remMin: number | null;
  lightMin: number | null;
  awakeMin: number | null;
  bedStart: string | null;
  bedEnd: string | null;
  origin: string | null;
}

interface NightRow {
  id: string;
  date_key: string;
  asleep_min: number;
  deep_min: number | null;
  rem_min: number | null;
  light_min: number | null;
  awake_min: number | null;
  bed_start: string | null;
  bed_end: string | null;
  origin: string | null;
  deleted_at: string | null;
}

const toNight = (r: NightRow): StoredNight => ({
  dateKey: r.date_key,
  asleepMin: r.asleep_min,
  deepMin: r.deep_min,
  remMin: r.rem_min,
  lightMin: r.light_min,
  awakeMin: r.awake_min,
  bedStart: r.bed_start,
  bedEnd: r.bed_end,
  origin: r.origin,
});

/** Saves the night's sleep and stages; a night the user deleted stays deleted. */
export function upsertSleepNight(n: SleepNight): boolean {
  const db = getDb();
  const row = db.getFirstSync<NightRow>('SELECT * FROM sleep_nights WHERE date_key = ? ORDER BY updated_at DESC LIMIT 1', [n.dateKey]);
  const values = [n.asleepMin, n.deepMin, n.remMin, n.lightMin, n.awakeMin, new Date(n.start).toISOString(), new Date(n.end).toISOString(), n.origin];
  const now = nowIso();
  if (row) {
    if (row.deleted_at) return false;
    const same = [row.asleep_min, row.deep_min, row.rem_min, row.light_min, row.awake_min, row.bed_start, row.bed_end, row.origin].every((v, i) => v === values[i]);
    if (same) return false;
    db.runSync(
      'UPDATE sleep_nights SET asleep_min = ?, deep_min = ?, rem_min = ?, light_min = ?, awake_min = ?, bed_start = ?, bed_end = ?, origin = ?, updated_at = ? WHERE id = ?',
      [...values, now, row.id],
    );
  } else {
    db.runSync(
      `INSERT INTO sleep_nights (id, date_key, asleep_min, deep_min, rem_min, light_min, awake_min, bed_start, bed_end, origin, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId(), n.dateKey, ...values, now, now],
    );
  }
  return true;
}

/** Nights from the watch between two mornings, oldest first. */
export function sleepNightsBetween(from: string, to: string): StoredNight[] {
  const rows = getDb().getAllSync<NightRow>('SELECT * FROM sleep_nights WHERE deleted_at IS NULL AND date_key >= ? AND date_key <= ? ORDER BY date_key, updated_at DESC', [
    from,
    to,
  ]);
  // Two phones syncing the same watch can each save a night; keep the newest.
  const kept = new Set<string>();
  return rows.filter((r) => !kept.has(r.date_key) && kept.add(r.date_key)).map(toNight);
}

export const sleepNight = (day: string): StoredNight | null => sleepNightsBetween(day, day)[0] ?? null;

/* ---------------- weigh-ins ---------------- */

const seen = (table: 'weight_entries' | 'body_comp_entries' | 'cardio_sessions' | 'workouts', externalId: string) =>
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

/* ---------------- workouts ---------------- */

/** True when two stretches of time share at least half of the shorter one. */
function sameSession(a: [number, number], b: [number, number]): boolean {
  const shared = Math.min(a[1], b[1]) - Math.max(a[0], b[0]);
  return shared > 0 && shared >= 0.5 * Math.min(a[1] - a[0], b[1] - b[0]);
}

/** The Metakai gym session a watch strength workout was recorded during, including one still going. */
function matchingLift(w: ImportedWorkout): string | null {
  const rows = getDb().getAllSync<{ id: string; started_at: string; ended_at: string | null }>(
    'SELECT id, started_at, ended_at FROM workouts WHERE deleted_at IS NULL AND external_id IS NULL AND started_at < ? AND (ended_at IS NULL OR ended_at > ?)',
    [new Date(w.end).toISOString(), new Date(w.start).toISOString()],
  );
  return rows.find((r) => sameSession([Date.parse(r.started_at), r.ended_at ? Date.parse(r.ended_at) : Date.now()], [w.start, w.end]))?.id ?? null;
}

/**
 * Metakai cardio the watch also recorded: a GPS recording at the same time, or a session logged
 * by hand on the same day with the same activity and about the same length.
 */
function matchingCardio(w: ImportedWorkout): string | null {
  const rows = getDb().getAllSync<{ id: string; created_at: string; started_at: string | null; duration_min: number; elapsed_min: number | null }>(
    'SELECT id, created_at, started_at, duration_min, elapsed_min FROM cardio_sessions WHERE deleted_at IS NULL AND source IS NULL AND external_id IS NULL AND date_key = ? AND kind = ?',
    [dateKey(new Date(w.start)), w.kind],
  );
  const minutes = (w.end - w.start) / 60000;
  const match = rows.find((r) => {
    const length = (r.elapsed_min ?? r.duration_min) * 60000;
    const start = r.started_at ? Date.parse(r.started_at) : r.elapsed_min != null ? Date.parse(r.created_at) - length : null;
    if (start != null) return sameSession([start, start + length], [w.start, w.end]);
    return Math.abs(r.duration_min - minutes) <= 0.25 * minutes;
  });
  return match?.id ?? null;
}

export type ImportResult = 'added' | 'linked' | null;

/**
 * A workout recorded on a watch. When Metakai already has it (a gym session logged here, or a run
 * recorded or logged here) the watch's heart rate and calories are added to that one instead of
 * saving it twice. Anything else is saved as a session: runs, rides, swims, strength, yoga.
 */
export function importWorkout(w: ImportedWorkout): ImportResult {
  const durationMin = Math.round(((w.end - w.start) / 60000) * 10) / 10;
  if (durationMin < 1 || seen('cardio_sessions', w.externalId) || seen('workouts', w.externalId)) return null;
  const db = getDb();
  const now = nowIso();

  const lift = w.strength ? matchingLift(w) : null;
  if (lift) {
    db.runSync('UPDATE workouts SET external_id = ?, avg_hr = COALESCE(avg_hr, ?), max_hr = COALESCE(max_hr, ?), updated_at = ? WHERE id = ?', [
      w.externalId,
      w.avgHr,
      w.maxHr,
      now,
      lift,
    ]);
    return 'linked';
  }
  const cardio = w.strength ? null : matchingCardio(w);
  if (cardio) {
    db.runSync(
      'UPDATE cardio_sessions SET external_id = ?, avg_hr = COALESCE(avg_hr, ?), max_hr = COALESCE(max_hr, ?), kcal = COALESCE(kcal, ?), updated_at = ? WHERE id = ?',
      [w.externalId, w.avgHr, w.maxHr, w.kcal, now, cardio],
    );
    return 'linked';
  }

  const kcal = w.kcal ?? Math.round(cardioCalories({ kind: w.kind, durationMin, distanceKm: w.distanceKm, bodyweightKg: latestKg() }));
  db.runSync(
    `INSERT INTO cardio_sessions (id, date_key, kind, duration_min, distance_km, avg_hr, max_hr, kcal, note, title, source, external_id, origin, started_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      w.origin,
      new Date(w.start).toISOString(),
      now,
      now,
    ],
  );
  return 'added';
}

/** Gym sessions and recordings since a day that have no heart rate yet, with when they ran. */
export function sessionsWithoutHeartRate(since: string): { table: 'workouts' | 'cardio_sessions'; id: string; start: number; end: number }[] {
  const db = getDb();
  const lifts = db
    .getAllSync<{ id: string; started_at: string; ended_at: string }>(
      'SELECT id, started_at, ended_at FROM workouts WHERE deleted_at IS NULL AND ended_at IS NOT NULL AND avg_hr IS NULL AND date_key >= ?',
      [since],
    )
    .map((r) => ({ table: 'workouts' as const, id: r.id, start: Date.parse(r.started_at), end: Date.parse(r.ended_at) }));
  const cardio = db
    .getAllSync<{ id: string; created_at: string; started_at: string | null; elapsed_min: number | null; duration_min: number }>(
      'SELECT id, created_at, started_at, elapsed_min, duration_min FROM cardio_sessions WHERE deleted_at IS NULL AND source IS NULL AND avg_hr IS NULL AND (started_at IS NOT NULL OR elapsed_min IS NOT NULL) AND date_key >= ?',
      [since],
    )
    .map((r) => {
      const length = (r.elapsed_min ?? r.duration_min) * 60000;
      const start = r.started_at ? Date.parse(r.started_at) : Date.parse(r.created_at) - length;
      return { table: 'cardio_sessions' as const, id: r.id, start, end: start + length };
    });
  return [...lifts, ...cardio].filter((s) => s.end - s.start >= 60000);
}

export function notifyImported() {
  notify('health_markers', 'weight_entries', 'body_comp_entries', 'cardio_sessions', 'workouts', 'sleep_nights');
}

/* ---------------- sending to the health app ---------------- */

/** Metakai's own weigh-ins from the last month that haven't been sent to the health app yet. */
export function unsharedWeights(): { id: string; kg: number; at: number }[] {
  return getDb()
    .getAllSync<{ id: string; kg: number; measured_at: string }>(
      "SELECT id, kg, measured_at FROM weight_entries WHERE deleted_at IS NULL AND shared_at IS NULL AND source != 'watch' AND date_key >= ?",
      [addDays(dateKey(), -30)],
    )
    .map((r) => ({ id: r.id, kg: r.kg, at: Date.parse(r.measured_at) }));
}

/** Finished gym sessions and Metakai cardio from the last month, not yet sent. Ones a watch also recorded stay out. */
export function unsharedWorkouts(): SharedWorkout[] {
  const db = getDb();
  const since = addDays(dateKey(), -30);
  const lifts = db
    .getAllSync<{ id: string; name: string; started_at: string; ended_at: string; kcal: number | null }>(
      'SELECT id, name, started_at, ended_at, kcal FROM workouts WHERE deleted_at IS NULL AND ended_at IS NOT NULL AND shared_at IS NULL AND external_id IS NULL AND date_key >= ?',
      [since],
    )
    .map((r): SharedWorkout => ({ id: r.id, kind: 'strength', title: r.name, start: Date.parse(r.started_at), end: Date.parse(r.ended_at), kcal: r.kcal, distanceKm: null }));
  const cardio = db
    .getAllSync<{
      id: string;
      kind: SharedWorkout['kind'];
      title: string | null;
      created_at: string;
      started_at: string | null;
      duration_min: number;
      elapsed_min: number | null;
      kcal: number | null;
      distance_km: number | null;
    }>(
      'SELECT id, kind, title, created_at, started_at, duration_min, elapsed_min, kcal, distance_km FROM cardio_sessions WHERE deleted_at IS NULL AND shared_at IS NULL AND source IS NULL AND external_id IS NULL AND date_key >= ?',
      [since],
    )
    .map((r): SharedWorkout => {
      // Logged when it ended unless the start is known; recordings also know their paused time.
      const length = (r.elapsed_min ?? r.duration_min) * 60000;
      const start = r.started_at ? Date.parse(r.started_at) : Date.parse(r.created_at) - length;
      return { id: r.id, kind: r.kind, title: r.title ?? 'Cardio', start, end: start + length, kcal: r.kcal, distanceKm: r.distance_km };
    });
  return [...lifts, ...cardio];
}

export function markShared(table: 'weight_entries' | 'workouts' | 'cardio_sessions', id: string) {
  // Leaves updated_at alone so Drive sync doesn't treat this as an edit.
  getDb().runSync(`UPDATE ${table} SET shared_at = ? WHERE id = ?`, [nowIso(), id]);
}

/** Heart rate from a Bluetooth sensor or the watch, saved with the workout or recording it was worn for. */
export function saveHeartRate(table: 'workouts' | 'cardio_sessions', id: string, stats: { avg: number; max: number }, silent = false) {
  getDb().runSync(`UPDATE ${table} SET avg_hr = ?, max_hr = ?, updated_at = ? WHERE id = ?`, [stats.avg, stats.max, nowIso(), id]);
  if (!silent) notify(table);
}

/* ---------------- reading back ---------------- */

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

/* ---------------- overview ---------------- */

export interface MetricSummary {
  latest: { dateKey: string; value: number; origin: string | null } | null;
  /** The last 7 days, oldest first; null where there's no reading. */
  week: (number | null)[];
  /** Average of the 30 days before the latest reading, from the same app. */
  normal: number | null;
}

/** Latest reading, last week and usual level for each kind, for the overview. */
export function metricSummaries<K extends MarkerKind>(kinds: K[], today = dateKey()): Record<K, MetricSummary> {
  const since = addDays(today, -37);
  const rows = getDb().getAllSync<{ date_key: string; kind: K; value: number; origin: string | null }>(
    `SELECT date_key, kind, value, origin FROM health_markers
     WHERE deleted_at IS NULL AND kind IN (${kinds.map(() => '?').join(', ')}) AND date_key >= ? AND date_key <= ?
     ORDER BY date_key, updated_at DESC`,
    [...kinds, since, today],
  );
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const out = {} as Record<K, MetricSummary>;
  for (const kind of kinds) {
    const kept = new Set<string>();
    const series = rows.filter((r) => r.kind === kind && !kept.has(r.date_key) && kept.add(r.date_key));
    const last = series[series.length - 1];
    const before = last ? series.filter((r) => r.date_key < last.date_key && r.date_key >= addDays(last.date_key, -30) && r.origin === last.origin) : [];
    out[kind] = {
      latest: last ? { dateKey: last.date_key, value: last.value, origin: last.origin } : null,
      week: days.map((d) => series.find((r) => r.date_key === d)?.value ?? null),
      normal: before.length >= 5 ? before.reduce((a, r) => a + r.value, 0) / before.length : null,
    };
  }
  return out;
}
