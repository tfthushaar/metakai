/** Achievement definitions. Progress is computed from a stats snapshot, so the list stays pure and testable. */

export type AchievementCategory = 'training' | 'running' | 'nutrition' | 'body' | 'habits' | 'ranks';

export const CATEGORY_LABEL: Record<AchievementCategory, string> = {
  training: 'Training',
  running: 'Running & cardio',
  nutrition: 'Nutrition',
  body: 'Body',
  habits: 'Consistency',
  ranks: 'Ranks',
};

export interface AchievementStats {
  workouts: number;
  volumeKg: number;
  trainingWeekStreak: number;
  /** Best 1RM ÷ bodyweight. */
  benchRatio: number;
  squatRatio: number;
  deadliftRatio: number;
  gpsRuns: number;
  longestRunKm: number;
  totalRunKm: number;
  best5kSec: number | null;
  best10kSec: number | null;
  halfDone: boolean;
  marathonDone: boolean;
  cardioSessions: number;
  daysLogged: number;
  logStreak: number;
  proteinDays: number;
  weighIns: number;
  photos: number;
  goalReached: boolean;
  checkIns: number;
  /** Highest tier index (0 Iron … 6 Champion) of any muscle group, the overall physique rank and the run rank. */
  bestGroupTier: number;
  physiqueTier: number;
  runTier: number;
}

export interface AchievementDef {
  id: string;
  category: AchievementCategory;
  title: string;
  description: string;
  /** Lucide icon name registered in ui/Icon. */
  icon: string;
  target: number;
  value: (s: AchievementStats) => number;
  /** Formats progress, e.g. "12 / 50". */
  unit?: string;
  /** Hidden until earned. */
  secret?: boolean;
}

const count = (id: string, category: AchievementCategory, title: string, description: string, icon: string, target: number, value: (s: AchievementStats) => number, unit?: string): AchievementDef => ({
  id,
  category,
  title,
  description,
  icon,
  target,
  value,
  unit,
});

const flag = (id: string, category: AchievementCategory, title: string, description: string, icon: string, done: (s: AchievementStats) => boolean): AchievementDef => ({
  id,
  category,
  title,
  description,
  icon,
  target: 1,
  value: (s) => (done(s) ? 1 : 0),
});

const TIER_NAMES = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Champion'];

export const ACHIEVEMENTS: AchievementDef[] = [
  // Training
  count('first_workout', 'training', 'First rep', 'Finish your first workout.', 'dumbbell', 1, (s) => s.workouts),
  count('workouts_10', 'training', 'Getting started', 'Finish 10 workouts.', 'dumbbell', 10, (s) => s.workouts, 'workouts'),
  count('workouts_50', 'training', 'Regular', 'Finish 50 workouts.', 'dumbbell', 50, (s) => s.workouts, 'workouts'),
  count('workouts_100', 'training', 'Centurion', 'Finish 100 workouts.', 'trophy', 100, (s) => s.workouts, 'workouts'),
  count('workouts_250', 'training', 'Lifer', 'Finish 250 workouts.', 'trophy', 250, (s) => s.workouts, 'workouts'),
  count('volume_10t', 'training', '10 tonnes', 'Lift 10,000 kg in total.', 'zap', 10_000, (s) => s.volumeKg, 'kg'),
  count('volume_100t', 'training', '100 tonnes', 'Lift 100,000 kg in total.', 'zap', 100_000, (s) => s.volumeKg, 'kg'),
  count('volume_1000t', 'training', 'Kilotonne', 'Lift 1,000,000 kg in total.', 'zap', 1_000_000, (s) => s.volumeKg, 'kg'),
  count('week_streak_4', 'training', 'Month strong', 'Train every week for 4 weeks.', 'flame', 4, (s) => s.trainingWeekStreak, 'weeks'),
  count('week_streak_12', 'training', 'Quarter strong', 'Train every week for 12 weeks.', 'flame', 12, (s) => s.trainingWeekStreak, 'weeks'),
  count('week_streak_52', 'training', 'Year strong', 'Train every week for a year.', 'flame', 52, (s) => s.trainingWeekStreak, 'weeks'),
  flag('bench_bw', 'training', 'Bodyweight bench', 'Bench press your bodyweight.', 'trophy', (s) => s.benchRatio >= 1),
  flag('squat_1_5', 'training', 'Heavy squat', 'Squat 1.5× your bodyweight.', 'trophy', (s) => s.squatRatio >= 1.5),
  flag('deadlift_2', 'training', 'Double bodyweight pull', 'Deadlift 2× your bodyweight.', 'trophy', (s) => s.deadliftRatio >= 2),
  flag('total_5_5', 'training', 'Big three', 'Total 5.5× your bodyweight across squat, bench and deadlift.', 'star', (s) => s.benchRatio + s.squatRatio + s.deadliftRatio >= 5.5),

  // Running & cardio
  count('first_gps', 'running', 'Out the door', 'Record your first GPS run.', 'navigation', 1, (s) => s.gpsRuns),
  count('gps_25', 'running', 'Road regular', 'Record 25 GPS runs.', 'navigation', 25, (s) => s.gpsRuns, 'runs'),
  count('run_5k', 'running', '5K finisher', 'Run 5 km in one go.', 'footprints', 5, (s) => s.longestRunKm, 'km'),
  count('run_10k', 'running', '10K finisher', 'Run 10 km in one go.', 'footprints', 10, (s) => s.longestRunKm, 'km'),
  flag('run_half', 'running', 'Half marathoner', 'Run a half marathon.', 'trophy', (s) => s.halfDone),
  flag('run_marathon', 'running', 'Marathoner', 'Run a marathon.', 'trophy', (s) => s.marathonDone),
  flag('sub_30_5k', 'running', 'Sub-30 5K', 'Run 5 km in under 30 minutes.', 'timer', (s) => s.best5kSec != null && s.best5kSec < 1800),
  flag('sub_25_5k', 'running', 'Sub-25 5K', 'Run 5 km in under 25 minutes.', 'timer', (s) => s.best5kSec != null && s.best5kSec < 1500),
  flag('sub_20_5k', 'running', 'Sub-20 5K', 'Run 5 km in under 20 minutes.', 'zap', (s) => s.best5kSec != null && s.best5kSec < 1200),
  flag('sub_50_10k', 'running', 'Sub-50 10K', 'Run 10 km in under 50 minutes.', 'timer', (s) => s.best10kSec != null && s.best10kSec < 3000),
  count('distance_100', 'running', '100 km', 'Run 100 km in total.', 'footprints', 100, (s) => s.totalRunKm, 'km'),
  count('distance_1000', 'running', '1,000 km', 'Run 1,000 km in total.', 'footprints', 1000, (s) => s.totalRunKm, 'km'),
  count('cardio_25', 'running', 'Heart of it', 'Log 25 cardio sessions.', 'heartPulse', 25, (s) => s.cardioSessions, 'sessions'),

  // Nutrition
  count('log_first', 'nutrition', 'First bite', 'Log your first meal.', 'utensils', 1, (s) => s.daysLogged),
  count('log_streak_7', 'nutrition', 'Week of meals', 'Log food 7 days in a row.', 'utensils', 7, (s) => s.logStreak, 'days'),
  count('log_streak_30', 'nutrition', 'Month of meals', 'Log food 30 days in a row.', 'utensils', 30, (s) => s.logStreak, 'days'),
  count('log_days_100', 'nutrition', 'Hundred days', 'Log food on 100 days.', 'utensils', 100, (s) => s.daysLogged, 'days'),
  count('protein_30', 'nutrition', 'Protein pro', 'Hit your protein target on 30 days.', 'target', 30, (s) => s.proteinDays, 'days'),

  // Body
  count('weigh_30', 'body', 'On the scale', 'Log 30 weigh-ins.', 'scale', 30, (s) => s.weighIns, 'weigh-ins'),
  count('weigh_100', 'body', 'Data driven', 'Log 100 weigh-ins.', 'scale', 100, (s) => s.weighIns, 'weigh-ins'),
  count('photos_10', 'body', 'Picture this', 'Take 10 progress photos.', 'user', 10, (s) => s.photos, 'photos'),
  flag('goal_reached', 'body', 'Goal reached', 'Reach the target weight of a phase.', 'flag', (s) => s.goalReached),

  // Consistency
  count('checkin_7', 'habits', 'Tuned in', 'Complete 7 readiness check-ins.', 'heartPulse', 7, (s) => s.checkIns, 'check-ins'),
  count('checkin_30', 'habits', 'Self-aware', 'Complete 30 readiness check-ins.', 'heartPulse', 30, (s) => s.checkIns, 'check-ins'),

  // Ranks
  ...[1, 2, 3, 4, 5, 6].map((t) =>
    flag(`group_${TIER_NAMES[t].toLowerCase()}`, 'ranks', `${TIER_NAMES[t]} muscle`, `Reach ${TIER_NAMES[t]} in any muscle group.`, 'star', (s) => s.bestGroupTier >= t),
  ),
  ...[3, 4, 5, 6].map((t) =>
    flag(`physique_${TIER_NAMES[t].toLowerCase()}`, 'ranks', `${TIER_NAMES[t]} physique`, `Reach ${TIER_NAMES[t]} overall in the Physique pass.`, 'trophy', (s) => s.physiqueTier >= t),
  ),
  ...[3, 4, 5, 6].map((t) =>
    flag(`run_${TIER_NAMES[t].toLowerCase()}`, 'ranks', `${TIER_NAMES[t]} runner`, `Reach ${TIER_NAMES[t]} in the Run pass.`, 'trophy', (s) => s.runTier >= t),
  ),
];

export interface AchievementProgress {
  def: AchievementDef;
  value: number;
  /** 0–1. */
  progress: number;
  complete: boolean;
}

export function evaluateAchievements(stats: AchievementStats): AchievementProgress[] {
  return ACHIEVEMENTS.map((def) => {
    const value = def.value(stats);
    return { def, value, progress: Math.max(0, Math.min(1, value / def.target)), complete: value >= def.target };
  });
}

export function progressLabel(p: AchievementProgress): string {
  if (p.def.target === 1) return p.complete ? 'Done' : 'Not yet';
  const fmt = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000).toLocaleString('en-US')}k` : Math.floor(n).toLocaleString('en-US'));
  return `${fmt(Math.min(p.value, p.def.target))} / ${fmt(p.def.target)}${p.def.unit ? ` ${p.def.unit}` : ''}`;
}

/** Longest run of consecutive keys ending at `end` (or the key before it), given sorted unique keys and a step function. */
export function streakEndingAt(keys: Set<string>, end: string, prev: (k: string) => string): number {
  let k = keys.has(end) ? end : prev(end);
  let n = 0;
  while (keys.has(k)) {
    n++;
    k = prev(k);
  }
  return n;
}
