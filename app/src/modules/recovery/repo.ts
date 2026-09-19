import { getDb, newId, notify, nowIso } from '../../core/db/database';
import { getProfile } from '../../core/db/repo';
import { addDays, dateKey } from '../../lib/dates';
import type { TrainedExercise } from '../../lib/muscleRecovery';
import type { CheckInAnswers } from '../../lib/readiness';
import { baseline, recoveryScore, trainingLoad, type LoadSession, type Recovery, type Trend } from '../../lib/recoveryScore';
import { sleepNightsBetween, WATCH, type StoredNight } from '../wearables/repo';
import { getExercise } from '../workouts/repo';

export const EMPTY_ANSWERS: CheckInAnswers = { sleepHours: null, sleepQuality: null, soreness: null, stress: null, energy: null, mood: null };

interface Row {
  id: string;
  date_key: string;
  sleep_hours: number | null;
  sleep_quality: number | null;
  soreness: number | null;
  stress: number | null;
  energy: number | null;
  mood: number | null;
}

const toAnswers = (r: Row): CheckInAnswers => ({
  sleepHours: r.sleep_hours,
  sleepQuality: r.sleep_quality,
  soreness: r.soreness,
  stress: r.stress,
  energy: r.energy,
  mood: r.mood,
});

export function getCheckIn(day: string): CheckInAnswers | null {
  const r = getDb().getFirstSync<Row>('SELECT * FROM recovery_checkins WHERE date_key = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1', [day]);
  return r ? toAnswers(r) : null;
}

/** One check-in per day; saving again updates it. */
export function saveCheckIn(day: string, a: CheckInAnswers) {
  const db = getDb();
  const now = nowIso();
  const existing = db.getFirstSync<{ id: string }>('SELECT id FROM recovery_checkins WHERE date_key = ? AND deleted_at IS NULL LIMIT 1', [day]);
  const values = [a.sleepHours, a.sleepQuality, a.soreness, a.stress, a.energy, a.mood];
  if (existing) {
    db.runSync(
      'UPDATE recovery_checkins SET sleep_hours = ?, sleep_quality = ?, soreness = ?, stress = ?, energy = ?, mood = ?, updated_at = ? WHERE id = ?',
      [...values, now, existing.id],
    );
  } else {
    db.runSync(
      `INSERT INTO recovery_checkins (id, date_key, sleep_hours, sleep_quality, soreness, stress, energy, mood, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId(), day, ...values, now, now],
    );
  }
  notify('recovery_checkins');
}

export function deleteCheckIn(day: string) {
  const now = nowIso();
  getDb().runSync('UPDATE recovery_checkins SET deleted_at = ?, updated_at = ? WHERE date_key = ? AND deleted_at IS NULL', [now, now, day]);
  notify('recovery_checkins');
}

/** Tables recovery reads, for live queries. */
export const RECOVERY_TABLES = ['recovery_checkins', 'health_markers', 'sleep_nights', 'workouts', 'workout_sets', 'cardio_sessions'] as const;

/** Days of HRV and resting heart rate that make up "your normal". */
const BASELINE_DAYS = 30;

interface Point {
  date_key: string;
  value: number;
  origin: string | null;
}

/** One reading per day (the newest), oldest first. */
function markerSeries(kind: 'hrv' | 'rhr', from: string, to: string): Point[] {
  const rows = getDb().getAllSync<Point>(
    'SELECT date_key, value, origin FROM health_markers WHERE deleted_at IS NULL AND kind = ? AND date_key >= ? AND date_key <= ? ORDER BY date_key, updated_at DESC',
    [kind, from, to],
  );
  const kept = new Set<string>();
  return rows.filter((r) => !kept.has(r.date_key) && kept.add(r.date_key));
}

/** Today's reading against earlier ones from the same app, so two devices never blend into one normal. */
function trendFor(series: Point[], day: string): Trend | null {
  const today = series.find((p) => p.date_key === day);
  if (!today) return null;
  const since = addDays(day, -BASELINE_DAYS);
  const history = series.filter((p) => p.date_key < day && p.date_key >= since && p.origin === today.origin).map((p) => p.value);
  return { today: today.value, history };
}

/** Every finished gym session and cardio session, for training load. */
function loadSessions(from: string, to: string): LoadSession[] {
  const db = getDb();
  const lifts = db
    .getAllSync<{ date_key: string; started_at: string; ended_at: string; avg_hr: number | null; sets: number }>(
      `SELECT w.date_key, w.started_at, w.ended_at, w.avg_hr,
         (SELECT COUNT(*) FROM workout_sets s WHERE s.workout_id = w.id AND s.deleted_at IS NULL AND s.completed_at IS NOT NULL AND s.kind != 'warmup') AS sets
       FROM workouts w WHERE w.deleted_at IS NULL AND w.ended_at IS NOT NULL AND w.date_key >= ? AND w.date_key <= ?`,
      [from, to],
    )
    .map(
      (r): LoadSession => ({
        dateKey: r.date_key,
        // A workout left running overnight shouldn't count as a day of training.
        minutes: Math.min(180, Math.max(0, (Date.parse(r.ended_at) - Date.parse(r.started_at)) / 60000)),
        avgHr: r.avg_hr,
        sets: r.sets,
        strength: true,
      }),
    );
  const cardio = db
    .getAllSync<{ date_key: string; duration_min: number; avg_hr: number | null; rpe: number | null }>(
      'SELECT date_key, duration_min, avg_hr, rpe FROM cardio_sessions WHERE deleted_at IS NULL AND date_key >= ? AND date_key <= ?',
      [from, to],
    )
    .map((r): LoadSession => ({ dateKey: r.date_key, minutes: r.duration_min, avgHr: r.avg_hr, rpe: r.rpe, strength: false }));
  return [...lifts, ...cardio];
}

function ageYears(): number {
  const birth = getProfile()?.birthDate;
  const years = birth ? (Date.now() - Date.parse(birth)) / (365.25 * 86400_000) : NaN;
  return Number.isFinite(years) && years > 10 && years < 100 ? years : 30;
}

interface Context {
  checkIns: Map<string, CheckInAnswers>;
  nights: Map<string, StoredNight>;
  watchSleep: Map<string, number>;
  hrv: Point[];
  rhr: Point[];
  sessions: LoadSession[];
  heart: { rest: number; max: number };
}

/** Everything recovery needs for the days from `from` to `to`, read once. */
function context(from: string, to: string): Context {
  const db = getDb();
  const checkIns = new Map(
    db
      .getAllSync<Row>('SELECT * FROM recovery_checkins WHERE deleted_at IS NULL AND date_key >= ? AND date_key <= ? ORDER BY updated_at', [from, to])
      .map((r) => [r.date_key, toAnswers(r)]),
  );
  const watchSleep = new Map(
    db
      .getAllSync<{ date_key: string; value: number }>(
        "SELECT date_key, value FROM health_markers WHERE deleted_at IS NULL AND kind = 'sleep' AND source = ? AND date_key >= ? AND date_key <= ? ORDER BY updated_at",
        [WATCH, from, to],
      )
      .map((r) => [r.date_key, r.value]),
  );
  const rhr = markerSeries('rhr', addDays(from, -BASELINE_DAYS), to);
  const restBase = baseline(rhr.slice(-BASELINE_DAYS).map((p) => p.value));
  return {
    checkIns,
    nights: new Map(sleepNightsBetween(from, to).map((n) => [n.dateKey, n])),
    watchSleep,
    hrv: markerSeries('hrv', addDays(from, -BASELINE_DAYS), to),
    rhr,
    sessions: loadSessions(addDays(from, -28), to),
    // Heart rate reserve for training load: resting from the watch, maximum estimated from age.
    heart: { rest: restBase?.mean ?? 60, max: 208 - 0.7 * ageYears() },
  };
}

function recoveryOn(day: string, ctx: Context): Recovery | null {
  const night = ctx.nights.get(day);
  const hours = ctx.watchSleep.get(day);
  return recoveryScore({
    checkIn: ctx.checkIns.get(day) ?? null,
    sleep: night ? { hours: night.asleepMin / 60, deepMin: night.deepMin, remMin: night.remMin } : hours != null ? { hours } : null,
    hrv: trendFor(ctx.hrv, day),
    rhr: trendFor(ctx.rhr, day),
    load: trainingLoad(ctx.sessions, day, ctx.heart),
  });
}

/** Readiness from the check-in, watch sleep, HRV, resting heart rate and training load. */
export function readinessFor(day: string): Recovery | null {
  return recoveryOn(day, context(day, day));
}

export function readinessHistory(days: number, today = dateKey()): { dateKey: string; score: number | null }[] {
  const ctx = context(addDays(today, -(days - 1)), today);
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(today, i - days + 1);
    return { dateKey: day, score: recoveryOn(day, ctx)?.score ?? null };
  });
}

/** Exercises trained in the last week, with their finish time, for muscle recovery. */
export function recentTraining(): TrainedExercise[] {
  const since = addDays(dateKey(), -8);
  const rows = getDb().getAllSync<{ exercise_id: string; ended_at: string; sets: number }>(
    `SELECT we.exercise_id, w.ended_at,
       (SELECT COUNT(*) FROM workout_sets s WHERE s.workout_exercise_id = we.id AND s.deleted_at IS NULL AND s.completed_at IS NOT NULL AND s.kind != 'warmup') AS sets
     FROM workout_exercises we JOIN workouts w ON w.id = we.workout_id
     WHERE we.deleted_at IS NULL AND w.deleted_at IS NULL AND w.ended_at IS NOT NULL AND w.date_key >= ?`,
    [since],
  );
  return rows
    .filter((r) => r.sets > 0)
    .map((r) => {
      const ex = getExercise(r.exercise_id);
      return { primary: ex.primary, secondary: ex.secondary, sets: r.sets, at: Date.parse(r.ended_at) };
    });
}
