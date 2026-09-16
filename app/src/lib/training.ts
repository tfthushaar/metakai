import type { Sex } from './energy';
import { estimate1RM, roundTo } from './strength';

export interface SessionSet {
  weightKg: number | null;
  reps: number | null;
}

export interface ProgressionAdvice {
  weightKg: number | null;
  reps: number | null;
  kind: 'increase' | 'repeat' | 'deload' | 'start';
  reason: string;
}

/** Lower-body compound lifts take bigger jumps. */
export function incrementFor(primaryMuscles: string[], equipment: string, baseIncrement: number): number {
  const lower = primaryMuscles.some((m) => ['quadriceps', 'hamstrings', 'glutes', 'lower back'].includes(m));
  if (equipment === 'dumbbell') return Math.max(1, baseIncrement / 1.25) * (lower ? 2 : 1);
  return lower && equipment === 'barbell' ? baseIncrement * 2 : baseIncrement;
}

/**
 * Double progression: once every working set reaches the top of the rep range,
 * add weight; otherwise repeat the weight and chase reps. Three stalled sessions
 * in a row suggest a 10% deload.
 */
export function doubleProgression(opts: {
  history: SessionSet[][];
  repMin: number;
  repMax: number;
  increment: number;
}): ProgressionAdvice {
  const { history, repMin, repMax, increment } = opts;
  const last = history[0]?.filter((s) => s.weightKg != null && s.reps != null) ?? [];
  if (last.length === 0) return { weightKg: null, reps: repMin, kind: 'start', reason: 'Pick a weight you can lift for the bottom of the rep range' };

  const weight = Math.max(...last.map((s) => s.weightKg!));
  const topSets = last.filter((s) => s.weightKg === weight);

  const bestE = (sets: SessionSet[]) =>
    Math.max(0, ...sets.filter((s) => s.weightKg != null && s.reps != null).map((s) => estimate1RM(s.weightKg!, s.reps!)));
  const recent = history.slice(0, 4).map(bestE);
  const stalled = recent.length >= 4 && recent[0] <= recent[3] + 0.01 && recent[1] <= recent[3] + 0.01 && recent[2] <= recent[3] + 0.01;
  if (stalled) {
    return { weightKg: roundTo(weight * 0.9, increment), reps: repMin, kind: 'deload', reason: 'No progress in 3 sessions: drop 10% and build back up' };
  }

  if (topSets.every((s) => s.reps! >= repMax)) {
    return { weightKg: weight + increment, reps: repMin, kind: 'increase', reason: `Hit ${repMax} reps on every set last time` };
  }
  const nextReps = Math.min(repMax, Math.min(...topSets.map((s) => s.reps!)) + 1);
  return { weightKg: weight, reps: nextReps, kind: 'repeat', reason: `Aim for ${nextReps}+ reps before adding weight` };
}

/* ---------------- weekly volume ---------------- */

export const VOLUME_GROUPS: { id: string; label: string; muscles: string[] }[] = [
  { id: 'chest', label: 'Chest', muscles: ['chest'] },
  { id: 'back', label: 'Back', muscles: ['lats', 'middle back', 'traps'] },
  { id: 'shoulders', label: 'Shoulders', muscles: ['shoulders'] },
  { id: 'biceps', label: 'Biceps', muscles: ['biceps'] },
  { id: 'triceps', label: 'Triceps', muscles: ['triceps'] },
  { id: 'quads', label: 'Quads', muscles: ['quadriceps'] },
  { id: 'hamstrings', label: 'Hamstrings', muscles: ['hamstrings'] },
  { id: 'glutes', label: 'Glutes', muscles: ['glutes', 'abductors', 'adductors'] },
  { id: 'calves', label: 'Calves', muscles: ['calves'] },
  { id: 'core', label: 'Core', muscles: ['abdominals', 'lower back'] },
  { id: 'forearms', label: 'Forearms', muscles: ['forearms'] },
];

export interface VolumeInput {
  primary: string[];
  secondary: string[];
  sets: number;
}

/** Hard sets per group: 1 per primary muscle hit, 0.5 per secondary. Each group counted once per exercise. */
export function weeklyVolume(entries: VolumeInput[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(VOLUME_GROUPS.map((g) => [g.id, 0]));
  for (const e of entries) {
    for (const g of VOLUME_GROUPS) {
      if (e.primary.some((m) => g.muscles.includes(m))) out[g.id] += e.sets;
      else if (e.secondary.some((m) => g.muscles.includes(m))) out[g.id] += e.sets * 0.5;
    }
  }
  return out;
}

export type VolumeStatus = 'none' | 'low' | 'good' | 'high';

export const VOLUME_RANGE = { low: 10, high: 20 } as const;

export function volumeStatus(sets: number, range: { low: number; high: number } = VOLUME_RANGE): VolumeStatus {
  if (sets <= 0) return 'none';
  if (sets < range.low) return 'low';
  if (sets > range.high) return 'high';
  return 'good';
}

/** Cutting keeps intensity and trims volume; bulking can push the top of the range. */
export function volumeRangeForGoal(direction: -1 | 0 | 1): { low: number; high: number } {
  if (direction < 0) return { low: 8, high: 16 };
  if (direction > 0) return { low: 10, high: 22 };
  return { low: 10, high: 20 };
}

/* ---------------- strength standards ---------------- */

export type StandardLift = 'squat' | 'bench' | 'deadlift' | 'ohp';

export const STANDARD_LIFT_IDS: Record<StandardLift, string[]> = {
  squat: ['Barbell_Squat', 'Barbell_Full_Squat'],
  bench: ['Barbell_Bench_Press_-_Medium_Grip'],
  deadlift: ['Barbell_Deadlift'],
  ohp: ['Standing_Military_Press', 'Barbell_Shoulder_Press'],
};

export const LEVELS = ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite'] as const;

/** Approximate 1RM ÷ bodyweight thresholds for each level. */
const RATIOS: Record<Sex, Record<StandardLift, number[]>> = {
  male: {
    squat: [0.75, 1.25, 1.75, 2.5, 3.0],
    bench: [0.5, 0.75, 1.25, 1.75, 2.0],
    deadlift: [1.0, 1.5, 2.0, 2.5, 3.0],
    ohp: [0.35, 0.55, 0.8, 1.05, 1.35],
  },
  female: {
    squat: [0.5, 0.75, 1.25, 1.5, 2.0],
    bench: [0.25, 0.5, 0.75, 1.0, 1.5],
    deadlift: [0.5, 1.0, 1.25, 1.75, 2.5],
    ohp: [0.2, 0.35, 0.5, 0.75, 1.0],
  },
};

export function liftForExercise(exerciseId: string): StandardLift | null {
  for (const [lift, ids] of Object.entries(STANDARD_LIFT_IDS) as [StandardLift, string[]][]) {
    if (ids.includes(exerciseId)) return lift;
  }
  return null;
}

export interface StandardResult {
  ratio: number;
  levelIndex: number;
  level: string;
  nextLevel: string | null;
  nextKg: number | null;
  /** 0–1 progress from current level threshold to the next. */
  progress: number;
  thresholdsKg: number[];
}

export function strengthStandard(sex: Sex, lift: StandardLift, oneRmKg: number, bodyweightKg: number): StandardResult {
  const ratios = RATIOS[sex][lift];
  const ratio = oneRmKg / bodyweightKg;
  let levelIndex = -1;
  ratios.forEach((r, i) => {
    if (ratio >= r) levelIndex = i;
  });
  const idx = Math.max(0, levelIndex);
  const nextIdx = levelIndex + 1;
  const hasNext = nextIdx < ratios.length;
  const lower = levelIndex < 0 ? 0 : ratios[levelIndex];
  const upper = hasNext ? ratios[nextIdx] : ratios[ratios.length - 1];
  return {
    ratio,
    levelIndex: levelIndex,
    level: levelIndex < 0 ? 'Untrained' : LEVELS[idx],
    nextLevel: hasNext ? LEVELS[nextIdx] : null,
    nextKg: hasNext ? ratios[nextIdx] * bodyweightKg : null,
    progress: hasNext ? Math.min(1, Math.max(0, (ratio - lower) / (upper - lower))) : 1,
    thresholdsKg: ratios.map((r) => r * bodyweightKg),
  };
}
