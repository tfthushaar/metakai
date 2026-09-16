import type { Sex } from './energy';

/* ================= tiers ================= */

export const TIERS = [
  { id: 'iron', name: 'Iron', color: '#8E8E93' },
  { id: 'bronze', name: 'Bronze', color: '#C4804F' },
  { id: 'silver', name: 'Silver', color: '#B8C0CC' },
  { id: 'gold', name: 'Gold', color: '#E9B949' },
  { id: 'platinum', name: 'Platinum', color: '#4FC9C0' },
  { id: 'diamond', name: 'Diamond', color: '#7C9CFF' },
  { id: 'champion', name: 'Champion', color: '#FF453A' },
] as const;

export type TierId = (typeof TIERS)[number]['id'];

const BAND = 15;
const DIVISIONS = ['III', 'II', 'I'] as const;

export interface TierInfo {
  index: number;
  id: TierId;
  name: string;
  color: string;
  /** III (lowest) to I; Champion has none. */
  division: (typeof DIVISIONS)[number] | null;
  label: string;
  /** Points needed to reach the next division or tier, or null at the top. */
  toNext: number | null;
  nextLabel: string | null;
  /** 0–1 progress through the current division. */
  progress: number;
}

function labelAt(score: number): { index: number; division: (typeof DIVISIONS)[number] | null } {
  const s = Math.max(0, Math.min(100, score));
  const index = Math.min(TIERS.length - 1, Math.floor(s / BAND));
  if (index === TIERS.length - 1) return { index, division: null };
  const div = Math.min(2, Math.floor((s - index * BAND) / (BAND / 3)));
  return { index, division: DIVISIONS[div] };
}

/** Scores run 0–100: six tiers of 15 points with three divisions each, then Champion from 90. */
export function tierFor(score: number): TierInfo {
  const s = Math.max(0, Math.min(100, score));
  const { index, division } = labelAt(s);
  const t = TIERS[index];
  const label = division ? `${t.name} ${division}` : t.name;
  if (!division) return { index, id: t.id, name: t.name, color: t.color, division, label, toNext: null, nextLabel: null, progress: 1 };
  const step = BAND / 3;
  const divIndex = DIVISIONS.indexOf(division);
  const start = index * BAND + divIndex * step;
  const nextAt = start + step;
  const next = labelAt(nextAt + 0.001);
  return {
    index,
    id: t.id,
    name: t.name,
    color: t.color,
    division,
    label,
    toNext: Math.max(0, Math.ceil(nextAt - s)),
    nextLabel: next.division ? `${TIERS[next.index].name} ${next.division}` : TIERS[next.index].name,
    progress: (s - start) / step,
  };
}

/* ================= population model ================= */

export interface Person {
  sex: Sex;
  age: number;
  weightKg: number;
  heightCm: number;
}

/** Who to compare against. Tiers always use `similar`. */
export type Cohort = 'similar' | 'weight' | 'height' | 'sex' | 'everyone';

export const COHORTS: { id: Cohort; label: string }[] = [
  { id: 'similar', label: 'Like you' },
  { id: 'weight', label: 'Same weight' },
  { id: 'height', label: 'Same height' },
  { id: 'sex', label: 'Same sex' },
  { id: 'everyone', label: 'Everyone' },
];

const REF: Record<Sex, { weightKg: number; heightCm: number }> = {
  male: { weightKg: 80, heightCm: 175 },
  female: { weightKg: 65, heightCm: 162 },
};
const REF_AGE = 30;
const REF_BMI = 25.5;

/** Boer formula for lean body mass; the base for size-adjusted strength. */
export function leanMassKg(p: Pick<Person, 'sex' | 'weightKg' | 'heightCm'>): number {
  const lbm = p.sex === 'male' ? 0.407 * p.weightKg + 0.267 * p.heightCm - 19.2 : 0.252 * p.weightKg + 0.473 * p.heightCm - 48.3;
  return Math.max(20, lbm);
}

/** Strength relative to peak (ages 23–40), for untrained adults. */
export function ageStrengthFactor(age: number): number {
  if (age < 23) return Math.max(0.7, 1 - 0.02 * (23 - age));
  if (age <= 40) return 1;
  return Math.max(0.45, 1 - 0.009 * (age - 40) - 0.00012 * (age - 40) ** 2);
}

export interface LiftRef {
  name: string;
  /** Median 1RM ÷ bodyweight of an untrained adult (age 30, average build). */
  ratio: Record<Sex, number>;
  /** Load is bodyweight plus any added weight. */
  bodyweight?: boolean;
  /** Muscle groups this lift ranks, with how directly it trains each (0–1). */
  groups: Partial<Record<RankGroup, number>>;
}

export const RANK_GROUPS = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core'] as const;
export type RankGroup = (typeof RANK_GROUPS)[number];

export const RANK_GROUP_LABEL: Record<RankGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  core: 'Core',
};

const r = (male: number, female: number) => ({ male, female });

/** Key lifts that rank each muscle group. Untrained medians follow published strength standards (ExRx, Strength Level). */
export const KEY_LIFTS: Record<string, LiftRef> = {
  'Barbell_Bench_Press_-_Medium_Grip': { name: 'Bench press', ratio: r(0.72, 0.49), groups: { chest: 1, triceps: 0.6, shoulders: 0.4 } },
  'Wide-Grip_Barbell_Bench_Press': { name: 'Wide-grip bench', ratio: r(0.7, 0.47), groups: { chest: 1, shoulders: 0.4 } },
  'Barbell_Incline_Bench_Press_-_Medium_Grip': { name: 'Incline bench', ratio: r(0.6, 0.4), groups: { chest: 1, shoulders: 0.5 } },
  Dumbbell_Bench_Press: { name: 'Dumbbell bench', ratio: r(0.62, 0.42), groups: { chest: 1, triceps: 0.5 } },
  Incline_Dumbbell_Press: { name: 'Incline dumbbell press', ratio: r(0.52, 0.35), groups: { chest: 1, shoulders: 0.5 } },
  'Dips_-_Chest_Version': { name: 'Chest dips', ratio: r(1.0, 0.6), bodyweight: true, groups: { chest: 0.9, triceps: 0.8 } },
  'Dips_-_Triceps_Version': { name: 'Dips', ratio: r(1.0, 0.6), bodyweight: true, groups: { triceps: 1, chest: 0.7 } },
  'Close-Grip_Barbell_Bench_Press': { name: 'Close-grip bench', ratio: r(0.62, 0.42), groups: { triceps: 1, chest: 0.7 } },
  Triceps_Pushdown: { name: 'Triceps pushdown', ratio: r(0.36, 0.22), groups: { triceps: 1 } },
  'Triceps_Pushdown_-_Rope_Attachment': { name: 'Rope pushdown', ratio: r(0.3, 0.18), groups: { triceps: 1 } },
  'EZ-Bar_Skullcrusher': { name: 'Skull crusher', ratio: r(0.3, 0.18), groups: { triceps: 1 } },
  Standing_Military_Press: { name: 'Overhead press', ratio: r(0.47, 0.34), groups: { shoulders: 1, triceps: 0.5 } },
  Barbell_Shoulder_Press: { name: 'Barbell shoulder press', ratio: r(0.47, 0.34), groups: { shoulders: 1, triceps: 0.5 } },
  Seated_Barbell_Military_Press: { name: 'Seated press', ratio: r(0.5, 0.35), groups: { shoulders: 1, triceps: 0.5 } },
  Dumbbell_Shoulder_Press: { name: 'Dumbbell shoulder press', ratio: r(0.4, 0.28), groups: { shoulders: 1, triceps: 0.4 } },
  Side_Lateral_Raise: { name: 'Lateral raise', ratio: r(0.1, 0.06), groups: { shoulders: 0.9 } },
  Barbell_Deadlift: { name: 'Deadlift', ratio: r(1.0, 0.72), groups: { back: 0.9, hamstrings: 0.8, glutes: 0.8 } },
  Sumo_Deadlift: { name: 'Sumo deadlift', ratio: r(1.0, 0.74), groups: { glutes: 0.9, quads: 0.6, back: 0.7 } },
  Trap_Bar_Deadlift: { name: 'Trap bar deadlift', ratio: r(1.05, 0.78), groups: { quads: 0.8, glutes: 0.8, back: 0.7 } },
  Bent_Over_Barbell_Row: { name: 'Barbell row', ratio: r(0.6, 0.4), groups: { back: 1, biceps: 0.4 } },
  'T-Bar_Row_with_Handle': { name: 'T-bar row', ratio: r(0.6, 0.4), groups: { back: 1, biceps: 0.4 } },
  Seated_Cable_Rows: { name: 'Cable row', ratio: r(0.65, 0.45), groups: { back: 1, biceps: 0.4 } },
  Pullups: { name: 'Pull-up', ratio: r(0.85, 0.55), bodyweight: true, groups: { back: 1, biceps: 0.6 } },
  Weighted_Pull_Ups: { name: 'Weighted pull-up', ratio: r(0.85, 0.55), bodyweight: true, groups: { back: 1, biceps: 0.6 } },
  'Chin-Up': { name: 'Chin-up', ratio: r(0.9, 0.58), bodyweight: true, groups: { back: 0.9, biceps: 0.9 } },
  'Wide-Grip_Lat_Pulldown': { name: 'Lat pulldown', ratio: r(0.65, 0.45), groups: { back: 1, biceps: 0.4 } },
  Barbell_Curl: { name: 'Barbell curl', ratio: r(0.35, 0.2), groups: { biceps: 1 } },
  Dumbbell_Bicep_Curl: { name: 'Dumbbell curl', ratio: r(0.15, 0.09), groups: { biceps: 1 } },
  Hammer_Curls: { name: 'Hammer curl', ratio: r(0.16, 0.1), groups: { biceps: 1 } },
  Preacher_Curl: { name: 'Preacher curl', ratio: r(0.3, 0.18), groups: { biceps: 1 } },
  Barbell_Squat: { name: 'Squat', ratio: r(0.86, 0.64), groups: { quads: 1, glutes: 0.8, hamstrings: 0.3 } },
  Barbell_Full_Squat: { name: 'Full squat', ratio: r(0.84, 0.62), groups: { quads: 1, glutes: 0.8 } },
  Front_Barbell_Squat: { name: 'Front squat', ratio: r(0.7, 0.52), groups: { quads: 1, glutes: 0.5 } },
  Leg_Press: { name: 'Leg press', ratio: r(1.6, 1.2), groups: { quads: 0.9, glutes: 0.6 } },
  Hack_Squat: { name: 'Hack squat', ratio: r(1.0, 0.75), groups: { quads: 1 } },
  Leg_Extensions: { name: 'Leg extension', ratio: r(0.6, 0.45), groups: { quads: 0.9 } },
  Romanian_Deadlift: { name: 'Romanian deadlift', ratio: r(0.8, 0.6), groups: { hamstrings: 1, glutes: 0.8, back: 0.4 } },
  'Stiff-Legged_Barbell_Deadlift': { name: 'Stiff-leg deadlift', ratio: r(0.8, 0.6), groups: { hamstrings: 1, glutes: 0.7 } },
  Lying_Leg_Curls: { name: 'Lying leg curl', ratio: r(0.45, 0.32), groups: { hamstrings: 0.9 } },
  Seated_Leg_Curl: { name: 'Seated leg curl', ratio: r(0.5, 0.35), groups: { hamstrings: 0.9 } },
  Barbell_Hip_Thrust: { name: 'Hip thrust', ratio: r(1.0, 0.9), groups: { glutes: 1, hamstrings: 0.4 } },
  Barbell_Glute_Bridge: { name: 'Glute bridge', ratio: r(0.9, 0.8), groups: { glutes: 1 } },
  Standing_Calf_Raises: { name: 'Standing calf raise', ratio: r(1.0, 0.8), groups: { calves: 1 } },
  Seated_Calf_Raise: { name: 'Seated calf raise', ratio: r(0.7, 0.55), groups: { calves: 1 } },
  Calf_Press_On_The_Leg_Press_Machine: { name: 'Leg press calf raise', ratio: r(1.3, 1.0), groups: { calves: 1 } },
  Smith_Machine_Calf_Raise: { name: 'Smith calf raise', ratio: r(0.9, 0.7), groups: { calves: 1 } },
  Cable_Crunch: { name: 'Cable crunch', ratio: r(0.45, 0.3), groups: { core: 1 } },
  Weighted_Crunches: { name: 'Weighted crunch', ratio: r(0.2, 0.13), groups: { core: 1 } },
};

function expectedFor(lift: LiftRef, p: Person): number {
  const ref = REF[p.sex];
  const refLbm = leanMassKg({ sex: p.sex, ...ref });
  const size = (leanMassKg(p) / refLbm) ** 0.67;
  return lift.ratio[p.sex] * ref.weightKg * size * ageStrengthFactor(p.age);
}

/** The average untrained person this user is compared with. */
function cohortPeople(p: Person, cohort: Cohort): Person[] {
  const ref = REF[p.sex];
  switch (cohort) {
    case 'similar':
      return [p];
    case 'weight':
      return [{ sex: p.sex, age: REF_AGE, weightKg: p.weightKg, heightCm: ref.heightCm }];
    case 'height':
      return [{ sex: p.sex, age: REF_AGE, heightCm: p.heightCm, weightKg: REF_BMI * (p.heightCm / 100) ** 2 }];
    case 'sex':
      return [{ sex: p.sex, age: REF_AGE, ...ref }];
    case 'everyone':
      return (['male', 'female'] as Sex[]).map((sex) => ({ sex, age: REF_AGE, ...REF[sex] }));
  }
}

/** Spread of untrained strength in the population (log scale). */
const SIGMA = 0.35;

/** Standard normal CDF. */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

export interface Comparison {
  /** Your 1RM divided by the untrained average. */
  multiple: number;
  /** Share of the cohort you are stronger than, 0–100. */
  percentile: number;
  expectedKg: number;
}

export function compareLift(liftId: string, oneRmKg: number, p: Person, cohort: Cohort = 'similar'): Comparison | null {
  const lift = KEY_LIFTS[liftId];
  if (!lift || oneRmKg <= 0) return null;
  const people = cohortPeople(p, cohort);
  const expected = people.map((x) => expectedFor(lift, x));
  const mean = expected.reduce((a, b) => a + b, 0) / expected.length;
  const pct = expected.reduce((a, e) => a + normalCdf(Math.log(oneRmKg / e) / SIGMA), 0) / expected.length;
  return { multiple: oneRmKg / mean, percentile: Math.round(Math.min(99.9, pct * 100) * 10) / 10, expectedKg: mean };
}

/** 1× untrained = 0 points, 3× (elite) = 100. */
export const strengthPoints = (multiple: number) => Math.max(0, Math.min(100, (Math.log(Math.max(multiple, 1e-6)) / Math.log(3)) * 100));

/* ================= physique pass ================= */

export interface LiftBest {
  exerciseId: string;
  /** Estimated 1RM including bodyweight for bodyweight lifts. */
  oneRmKg: number;
  dateKey: string;
  /** Workouts in the ranking window that included this lift. */
  sessions?: number;
}

export interface GroupRank {
  group: RankGroup;
  score: number;
  tier: TierInfo;
  strengthPoints: number;
  /** Share of recent weeks the group was trained, 0–1. */
  consistency: number;
  /** Lift that set the strength score. */
  best: (LiftBest & { directness: number; comparison: Comparison }) | null;
  lifts: (LiftBest & { comparison: Comparison })[];
}

export interface PhysiqueRank {
  groups: GroupRank[];
  overall: number;
  tier: TierInfo;
  strongest: GroupRank | null;
  weakest: GroupRank | null;
  /** Groups with at least one key lift logged. */
  rankedCount: number;
}

export const STRENGTH_WEIGHT = 0.8;

export function physiqueRank(bests: LiftBest[], weeksTrained: Partial<Record<RankGroup, number>>, weeksWindow: number, p: Person): PhysiqueRank {
  const groups = RANK_GROUPS.map((group): GroupRank => {
    let best: GroupRank['best'] = null;
    let bestPoints = 0;
    const lifts: GroupRank['lifts'] = [];
    for (const b of bests) {
      const lift = KEY_LIFTS[b.exerciseId];
      const directness = lift?.groups[group];
      if (!lift || !directness) continue;
      const comparison = compareLift(b.exerciseId, b.oneRmKg, p)!;
      lifts.push({ ...b, comparison });
      const pts = strengthPoints(1 + (comparison.multiple - 1) * directness);
      if (pts > bestPoints || !best) {
        bestPoints = pts;
        best = { ...b, directness, comparison };
      }
    }
    const consistency = Math.min(1, (weeksTrained[group] ?? 0) / weeksWindow);
    const score = STRENGTH_WEIGHT * bestPoints + (1 - STRENGTH_WEIGHT) * consistency * 100;
    lifts.sort((a, b) => b.comparison.multiple - a.comparison.multiple);
    return { group, score, tier: tierFor(score), strengthPoints: bestPoints, consistency, best, lifts };
  });
  const ranked = groups.filter((g) => g.best);
  const scores = groups.map((g) => g.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  // Weak groups pull the overall rank down, so balanced training pays.
  const overall = ranked.length ? 0.75 * mean + 0.25 * Math.min(...scores) : 0;
  const sorted = [...ranked].sort((a, b) => b.score - a.score);
  return {
    groups,
    overall,
    tier: tierFor(overall),
    strongest: sorted[0] ?? null,
    weakest: sorted.length > 1 ? sorted[sorted.length - 1] : null,
    rankedCount: ranked.length,
  };
}

/* ================= run pass ================= */

export interface RunDistance {
  id: string;
  label: string;
  meters: number;
  /** World-best reference times in seconds. */
  open: Record<Sex, number>;
}

export const RUN_DISTANCES: RunDistance[] = [
  { id: '1k', label: '1 km', meters: 1000, open: { male: 132, female: 149 } },
  { id: '1mi', label: '1 mile', meters: 1609.344, open: { male: 223, female: 248 } },
  { id: '5k', label: '5 km', meters: 5000, open: { male: 769, female: 853 } },
  { id: '10k', label: '10 km', meters: 10000, open: { male: 1584, female: 1734 } },
  { id: 'half', label: 'Half marathon', meters: 21097.5, open: { male: 3451, female: 3772 } },
  { id: 'marathon', label: 'Marathon', meters: 42195, open: { male: 7235, female: 7796 } },
];

/** Performance relative to open-age level, approximating World Masters Athletics age factors. */
export function runAgeFactor(age: number, sex: Sex): number {
  if (age < 18) return Math.max(0.7, 1 - 0.015 * (18 - age));
  if (age <= 30) return 1;
  const x = age - 30;
  return sex === 'male' ? Math.max(0.35, 1 - 0.0068 * x - 0.00004 * x * x) : Math.max(0.35, 1 - 0.0072 * x - 0.00005 * x * x);
}

/** Age-graded percentage: 100 = world best for your age and sex. */
export function ageGrade(distanceId: string, timeSec: number, sex: Sex, age: number): number {
  const d = RUN_DISTANCES.find((x) => x.id === distanceId);
  if (!d || timeSec <= 0) return 0;
  return (d.open[sex] / (runAgeFactor(age, sex) * timeSec)) * 100;
}

/** 35% age grade = 0 points, 90% = 100. */
export const runPoints = (ag: number) => Math.max(0, Math.min(100, ((ag - 35) / 55) * 100));

/** Median age grade of people who can cover the distance, and spread (log scale). */
const RUN_MEDIAN_AG = 45;
const RUN_SIGMA = 0.18;

/** Share of people of your sex and age you are faster than. */
export function runPercentile(ag: number): number {
  if (ag <= 0) return 0;
  return Math.round(Math.min(99.9, normalCdf(Math.log(ag / RUN_MEDIAN_AG) / RUN_SIGMA) * 100) * 10) / 10;
}

export function ageGradeLabel(ag: number): string {
  if (ag >= 90) return 'World class';
  if (ag >= 80) return 'National class';
  if (ag >= 70) return 'Regional class';
  if (ag >= 60) return 'Local class';
  if (ag >= 50) return 'Recreational';
  return 'Getting started';
}

export interface RunEffort {
  distanceId: string;
  timeSec: number;
  dateKey: string;
  /** Recorded with GPS. */
  verified: boolean;
}

export interface DistanceRank {
  distance: RunDistance;
  effort: RunEffort;
  ageGrade: number;
  points: number;
  percentile: number;
  tier: TierInfo;
}

export interface RunRank {
  distances: DistanceRank[];
  consistency: number;
  overall: number;
  tier: TierInfo;
  best: DistanceRank | null;
}

export function runRank(efforts: RunEffort[], weeksRun: number, weeksWindow: number, sex: Sex, age: number): RunRank {
  const distances: DistanceRank[] = [];
  for (const d of RUN_DISTANCES) {
    const mine = efforts.filter((e) => e.distanceId === d.id).sort((a, b) => a.timeSec - b.timeSec)[0];
    if (!mine) continue;
    const ag = ageGrade(d.id, mine.timeSec, sex, age);
    const points = runPoints(ag);
    distances.push({ distance: d, effort: mine, ageGrade: ag, points, percentile: runPercentile(ag), tier: tierFor(points) });
  }
  const consistency = Math.min(1, weeksRun / weeksWindow);
  const best = [...distances].sort((a, b) => b.points - a.points)[0] ?? null;
  const overall = best ? STRENGTH_WEIGHT * best.points + (1 - STRENGTH_WEIGHT) * consistency * 100 : 0;
  return { distances, consistency, overall, tier: tierFor(overall), best };
}

/** Standard distance a manual run matches (within 3%), with the time scaled to it. */
export function matchStandardDistance(distanceM: number, timeSec: number): { distanceId: string; timeSec: number } | null {
  const d = RUN_DISTANCES.find((x) => Math.abs(distanceM - x.meters) / x.meters <= 0.03);
  return d ? { distanceId: d.id, timeSec: (timeSec * d.meters) / distanceM } : null;
}
