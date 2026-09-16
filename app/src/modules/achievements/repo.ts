import { getDb, notify, nowIso } from '../../core/db/database';
import { evaluateAchievements, streakEndingAt, type AchievementProgress, type AchievementStats } from '../../lib/achievements';
import { addDays, dateKey, parseDateKey } from '../../lib/dates';
import { estimate1RM } from '../../lib/strength';
import { STANDARD_LIFT_IDS, type StandardLift } from '../../lib/training';
import type { Person } from '../../lib/ranks';
import { currentPhysiqueRank, currentRunRank, runEfforts } from '../ranks/repo';

const db = () => getDb();

/** Tables whose changes can unlock achievements. */
export const ACHIEVEMENT_TABLES = [
  'achievements',
  'workouts',
  'workout_sets',
  'cardio_sessions',
  'log_entries',
  'weight_entries',
  'progress_photos',
  'recovery_checkins',
  'phases',
] as const;
const n = (sql: string, params: (string | number)[] = []) => db().getFirstSync<{ n: number | null }>(sql, params)?.n ?? 0;

/** Monday of the week containing a date key. */
function weekStart(key: string): string {
  const d = parseDateKey(key);
  const offset = (d.getDay() + 6) % 7;
  return addDays(key, -offset);
}

function bestRatio(lift: StandardLift, bodyweightKg: number | null): number {
  if (!bodyweightKg) return 0;
  const ids = STANDARD_LIFT_IDS[lift];
  const rows = db().getAllSync<{ weight_kg: number; reps: number }>(
    `SELECT s.weight_kg, s.reps FROM workout_sets s
     JOIN workout_exercises we ON we.id = s.workout_exercise_id
     JOIN workouts w ON w.id = s.workout_id
     WHERE s.deleted_at IS NULL AND w.deleted_at IS NULL AND w.ended_at IS NOT NULL AND s.completed_at IS NOT NULL
       AND s.kind != 'warmup' AND s.weight_kg > 0 AND s.reps BETWEEN 1 AND 12
       AND we.exercise_id IN (${ids.map(() => '?').join(',')})`,
    ids,
  );
  const best = rows.reduce((m, r) => Math.max(m, estimate1RM(r.weight_kg, r.reps)), 0);
  return best / bodyweightKg;
}

function goalReached(): boolean {
  const phases = db().getAllSync<{ start_date: string; start_kg: number; target_kg: number }>(
    'SELECT start_date, start_kg, target_kg FROM phases WHERE deleted_at IS NULL AND target_kg IS NOT NULL',
  );
  return phases.some((p) => {
    if (Math.abs(p.target_kg - p.start_kg) < 0.5) return false;
    const op = p.target_kg < p.start_kg ? '<=' : '>=';
    return n(`SELECT COUNT(*) AS n FROM weight_entries WHERE deleted_at IS NULL AND date_key >= ? AND kg ${op} ?`, [p.start_date, p.target_kg]) > 0;
  });
}

export function achievementStats(person: Person | null, proteinTarget: number | null): AchievementStats {
  const today = dateKey();
  const bw = person?.weightKg ?? null;

  const trainedWeeks = new Set(
    db()
      .getAllSync<{ date_key: string }>(
        `SELECT date_key FROM workouts WHERE deleted_at IS NULL AND ended_at IS NOT NULL
         UNION SELECT date_key FROM cardio_sessions WHERE deleted_at IS NULL`,
      )
      .map((r) => weekStart(r.date_key)),
  );
  const logDays = new Set(db().getAllSync<{ date_key: string }>('SELECT DISTINCT date_key FROM log_entries WHERE deleted_at IS NULL').map((r) => r.date_key));

  const runs = db().getFirstSync<{ gps: number; longest: number | null; total: number | null }>(
    `SELECT SUM(CASE WHEN route IS NOT NULL THEN 1 ELSE 0 END) AS gps, MAX(distance_km) AS longest, SUM(distance_km) AS total
     FROM cardio_sessions WHERE deleted_at IS NULL AND kind = 'run'`,
  );
  const efforts = runEfforts(100_000);
  const bestOf = (id: string) => {
    const times = efforts.filter((e) => e.distanceId === id).map((e) => e.timeSec);
    return times.length ? Math.min(...times) : null;
  };
  const longest = runs?.longest ?? 0;

  const physique = person ? currentPhysiqueRank(person) : null;
  const run = person ? currentRunRank(person) : null;

  return {
    workouts: n('SELECT COUNT(*) AS n FROM workouts WHERE deleted_at IS NULL AND ended_at IS NOT NULL'),
    volumeKg: n(
      `SELECT SUM(COALESCE(s.weight_kg, 0) * COALESCE(s.reps, 0)) AS n FROM workout_sets s JOIN workouts w ON w.id = s.workout_id
       WHERE s.deleted_at IS NULL AND w.deleted_at IS NULL AND w.ended_at IS NOT NULL AND s.completed_at IS NOT NULL AND s.kind != 'warmup'`,
    ),
    trainingWeekStreak: streakEndingAt(trainedWeeks, weekStart(today), (k) => addDays(k, -7)),
    benchRatio: bestRatio('bench', bw),
    squatRatio: bestRatio('squat', bw),
    deadliftRatio: bestRatio('deadlift', bw),
    gpsRuns: runs?.gps ?? 0,
    longestRunKm: longest,
    totalRunKm: runs?.total ?? 0,
    best5kSec: bestOf('5k'),
    best10kSec: bestOf('10k'),
    halfDone: longest >= 21.0975 * 0.99,
    marathonDone: longest >= 42.195 * 0.99,
    cardioSessions: n('SELECT COUNT(*) AS n FROM cardio_sessions WHERE deleted_at IS NULL'),
    daysLogged: logDays.size,
    logStreak: streakEndingAt(logDays, today, (k) => addDays(k, -1)),
    proteinDays: proteinTarget
      ? n(
          `SELECT COUNT(*) AS n FROM (SELECT date_key FROM log_entries WHERE deleted_at IS NULL GROUP BY date_key HAVING SUM(protein) >= ?)`,
          [proteinTarget * 0.95],
        )
      : 0,
    weighIns: n('SELECT COUNT(*) AS n FROM weight_entries WHERE deleted_at IS NULL'),
    photos: n('SELECT COUNT(*) AS n FROM progress_photos WHERE deleted_at IS NULL'),
    goalReached: goalReached(),
    checkIns: n('SELECT COUNT(*) AS n FROM recovery_checkins WHERE deleted_at IS NULL'),
    bestGroupTier: physique ? Math.max(-1, ...physique.groups.filter((g) => g.best).map((g) => g.tier.index)) : -1,
    physiqueTier: physique && physique.rankedCount > 0 ? physique.tier.index : -1,
    runTier: run?.best ? run.tier.index : -1,
  };
}

/** Earned date for each unlocked achievement. */
export function earnedAchievements(): Map<string, string> {
  const rows = db().getAllSync<{ id: string; earned_at: string }>('SELECT id, earned_at FROM achievements WHERE deleted_at IS NULL');
  return new Map(rows.map((r) => [r.id, r.earned_at]));
}

export interface AchievementState extends AchievementProgress {
  earnedAt: string | null;
}

/** Evaluates every achievement, saves newly completed ones and returns them. Earned badges are never taken away. */
export function syncAchievements(person: Person | null, proteinTarget: number | null): { all: AchievementState[]; unlocked: AchievementState[] } {
  const earned = earnedAchievements();
  const results = evaluateAchievements(achievementStats(person, proteinTarget));
  const now = nowIso();
  const unlocked: AchievementState[] = [];
  const fresh = results.filter((r) => r.complete && !earned.has(r.def.id));
  if (fresh.length) {
    db().withTransactionSync(() => {
      for (const r of fresh) {
        db().runSync(
          `INSERT INTO achievements (id, earned_at, created_at, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET earned_at = excluded.earned_at, deleted_at = NULL, updated_at = excluded.updated_at`,
          [r.def.id, now, now, now],
        );
        earned.set(r.def.id, now);
      }
    });
    notify('achievements');
  }
  const all = results.map((r): AchievementState => {
    const earnedAt = earned.get(r.def.id) ?? null;
    return earnedAt ? { ...r, complete: true, progress: 1, earnedAt } : { ...r, earnedAt: null };
  });
  for (const r of fresh) unlocked.push(all.find((a) => a.def.id === r.def.id)!);
  return { all, unlocked };
}

/** Current progress merged with earned dates, without writing anything. */
export function readAchievements(person: Person | null, proteinTarget: number | null): AchievementState[] {
  const earned = earnedAchievements();
  return evaluateAchievements(achievementStats(person, proteinTarget)).map((r): AchievementState => {
    const earnedAt = earned.get(r.def.id) ?? null;
    return earnedAt ? { ...r, complete: true, progress: 1, earnedAt } : { ...r, earnedAt: null };
  });
}
