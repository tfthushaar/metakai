import { getDb, newId, notify, nowIso } from '../../core/db/database';
import { addDays, dateKey } from '../../lib/dates';
import type { TrainedExercise } from '../../lib/muscleRecovery';
import { readiness, type CheckInAnswers, type TrainingLoad } from '../../lib/readiness';
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

function workingSetsSince(fromDay: string, toDay: string): number {
  const r = getDb().getFirstSync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM workout_sets s JOIN workouts w ON w.id = s.workout_id
     WHERE s.deleted_at IS NULL AND w.deleted_at IS NULL AND s.completed_at IS NOT NULL AND s.kind != 'warmup'
       AND w.date_key >= ? AND w.date_key <= ?`,
    [fromDay, toDay],
  );
  return r?.n ?? 0;
}

/** Hard sets per day: last 3 days vs last 28 days. Null until there are three weeks of history to compare against. */
export function deleteCheckIn(day: string) {
  const now = nowIso();
  getDb().runSync('UPDATE recovery_checkins SET deleted_at = ?, updated_at = ? WHERE date_key = ? AND deleted_at IS NULL', [now, now, day]);
  notify('recovery_checkins');
}

export function trainingLoad(today = dateKey()): TrainingLoad | null {
  const first = getDb().getFirstSync<{ d: string | null }>('SELECT MIN(date_key) AS d FROM workouts WHERE deleted_at IS NULL AND ended_at IS NOT NULL');
  if (!first?.d || first.d > addDays(today, -21)) return null;
  return { acute: workingSetsSince(addDays(today, -2), today) / 3, chronic: workingSetsSince(addDays(today, -27), today) / 28 };
}

export function readinessFor(day: string) {
  const answers = getCheckIn(day);
  return answers ? readiness(answers, trainingLoad(day)) : null;
}

export function readinessHistory(days: number, today = dateKey()): { dateKey: string; score: number | null }[] {
  const rows = getDb().getAllSync<Row>('SELECT * FROM recovery_checkins WHERE date_key >= ? AND deleted_at IS NULL', [addDays(today, -(days - 1))]);
  const byDay = new Map(rows.map((r) => [r.date_key, r]));
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(today, i - days + 1);
    const r = byDay.get(day);
    return { dateKey: day, score: r ? (readiness(toAnswers(r), trainingLoad(day))?.score ?? null) : null };
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
