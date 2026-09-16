import { getDb } from '../../core/db/database';
import { addDays, daysBetween, dateKey } from '../../lib/dates';
import { KEY_LIFTS, matchStandardDistance, physiqueRank, RANK_GROUPS, runRank, type LiftBest, type Person, type RankGroup, type RunEffort } from '../../lib/ranks';
import { estimate1RM } from '../../lib/strength';
import { VOLUME_GROUPS } from '../../lib/training';
import type { RouteSplits } from '../cardio/repo';
import { getExercise } from '../workouts/repo';

/** Weeks of history that count toward consistency. */
export const CONSISTENCY_WEEKS = 12;
/** Lifts and runs older than this don't count toward the current rank. */
const LIFT_WINDOW_DAYS = 182;
const RUN_WINDOW_DAYS = 365;

const db = () => getDb();

/** Best estimated 1RM for each key lift since a date. Bodyweight lifts include bodyweight. */
export function keyLiftBests(bodyweightKg: number, sinceDays = LIFT_WINDOW_DAYS): LiftBest[] {
  const ids = Object.keys(KEY_LIFTS);
  const rows = db().getAllSync<{ exercise_id: string; weight_kg: number | null; reps: number; date_key: string }>(
    `SELECT we.exercise_id, s.weight_kg, s.reps, w.date_key
     FROM workout_sets s
     JOIN workout_exercises we ON we.id = s.workout_exercise_id
     JOIN workouts w ON w.id = s.workout_id
     WHERE s.deleted_at IS NULL AND we.deleted_at IS NULL AND w.deleted_at IS NULL AND w.ended_at IS NOT NULL
       AND s.completed_at IS NOT NULL AND s.kind != 'warmup' AND s.reps BETWEEN 1 AND 12
       AND w.date_key >= ? AND we.exercise_id IN (${ids.map(() => '?').join(',')})`,
    [addDays(dateKey(), -sinceDays), ...ids],
  );
  const best = new Map<string, LiftBest>();
  for (const r of rows) {
    const lift = KEY_LIFTS[r.exercise_id];
    const load = lift.bodyweight ? bodyweightKg + (r.weight_kg ?? 0) : (r.weight_kg ?? 0);
    if (load <= 0) continue;
    const oneRmKg = estimate1RM(load, r.reps);
    const prev = best.get(r.exercise_id);
    if (!prev || oneRmKg > prev.oneRmKg) best.set(r.exercise_id, { exerciseId: r.exercise_id, oneRmKg, dateKey: r.date_key });
  }
  return [...best.values()];
}

const GROUP_OF_MUSCLE = new Map<string, RankGroup>();
for (const g of VOLUME_GROUPS) {
  if ((RANK_GROUPS as readonly string[]).includes(g.id)) g.muscles.forEach((m) => GROUP_OF_MUSCLE.set(m, g.id as RankGroup));
}

/** Number of recent weeks in which each group was trained (primary muscle, completed working sets). */
export function weeksTrainedByGroup(weeks = CONSISTENCY_WEEKS): Partial<Record<RankGroup, number>> {
  const today = dateKey();
  const rows = db().getAllSync<{ exercise_id: string; date_key: string }>(
    `SELECT DISTINCT we.exercise_id, w.date_key
     FROM workout_exercises we JOIN workouts w ON w.id = we.workout_id
     WHERE we.deleted_at IS NULL AND w.deleted_at IS NULL AND w.ended_at IS NOT NULL AND w.date_key > ?
       AND EXISTS (SELECT 1 FROM workout_sets s WHERE s.workout_exercise_id = we.id AND s.deleted_at IS NULL AND s.completed_at IS NOT NULL AND s.kind != 'warmup')`,
    [addDays(today, -weeks * 7)],
  );
  const seen: Partial<Record<RankGroup, Set<number>>> = {};
  for (const r of rows) {
    const week = Math.floor(daysBetween(r.date_key, today) / 7);
    for (const m of getExercise(r.exercise_id).primary) {
      const g = GROUP_OF_MUSCLE.get(m);
      if (!g) continue;
      (seen[g] ??= new Set()).add(week);
    }
  }
  return Object.fromEntries(Object.entries(seen).map(([g, set]) => [g, set!.size]));
}

export function currentPhysiqueRank(p: Person) {
  return physiqueRank(keyLiftBests(p.weightKg), weeksTrainedByGroup(), CONSISTENCY_WEEKS, p);
}

/* ---------------- runs ---------------- */

interface RunRow {
  id: string;
  date_key: string;
  duration_min: number;
  distance_km: number | null;
  route: string | null;
  splits: string | null;
}

/** Best efforts from runs: GPS runs are verified, manual runs of a standard distance count for personal rank. */
export function runEfforts(sinceDays = RUN_WINDOW_DAYS): RunEffort[] {
  const rows = db().getAllSync<RunRow>(
    "SELECT id, date_key, duration_min, distance_km, route, splits FROM cardio_sessions WHERE deleted_at IS NULL AND kind = 'run' AND date_key >= ?",
    [addDays(dateKey(), -sinceDays)],
  );
  const out: RunEffort[] = [];
  for (const r of rows) {
    if (r.route && r.splits) {
      try {
        const best = (JSON.parse(r.splits) as RouteSplits).best ?? {};
        for (const [distanceId, timeSec] of Object.entries(best)) out.push({ distanceId, timeSec, dateKey: r.date_key, verified: true });
      } catch {
        // Skip malformed rows.
      }
    } else if (r.distance_km && r.duration_min > 0) {
      const m = matchStandardDistance(r.distance_km * 1000, r.duration_min * 60);
      if (m) out.push({ ...m, dateKey: r.date_key, verified: false });
    }
  }
  return out;
}

export function weeksWithRuns(weeks = CONSISTENCY_WEEKS): number {
  const today = dateKey();
  const rows = db().getAllSync<{ date_key: string }>("SELECT DISTINCT date_key FROM cardio_sessions WHERE deleted_at IS NULL AND kind = 'run' AND date_key > ?", [
    addDays(today, -weeks * 7),
  ]);
  return new Set(rows.map((r) => Math.floor(daysBetween(r.date_key, today) / 7))).size;
}

export function currentRunRank(p: Pick<Person, 'sex' | 'age'>) {
  return runRank(runEfforts(), weeksWithRuns(), CONSISTENCY_WEEKS, p.sex, p.age);
}

/** Latest logged weight, for use outside components. */
export function latestWeightKg(): number | null {
  return db().getFirstSync<{ kg: number }>('SELECT kg FROM weight_entries WHERE deleted_at IS NULL ORDER BY measured_at DESC LIMIT 1')?.kg ?? null;
}
