/** Muscle groups used by splits; ids match VOLUME_GROUPS in lib/training. */
export const SPLIT_GROUPS = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core'] as const;
export type SplitGroup = (typeof SPLIT_GROUPS)[number];

export const GROUP_LABEL: Record<SplitGroup, string> = {
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

/** Library muscles that count as each group, for filtering the exercise picker. */
export const GROUP_MUSCLES: Record<SplitGroup, string[]> = {
  chest: ['chest'],
  back: ['lats', 'middle back', 'traps', 'lower back'],
  shoulders: ['shoulders'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  quads: ['quadriceps'],
  hamstrings: ['hamstrings'],
  glutes: ['glutes', 'abductors', 'adductors'],
  calves: ['calves'],
  core: ['abdominals'],
};

/** Sensible default exercises per group: first entries are the main lifts. */
export const DEFAULT_EXERCISES: Record<SplitGroup, string[]> = {
  chest: ['Barbell_Bench_Press_-_Medium_Grip', 'Incline_Dumbbell_Press', 'Cable_Crossover'],
  back: ['Pullups', 'Bent_Over_Barbell_Row', 'Wide-Grip_Lat_Pulldown', 'Seated_Cable_Rows'],
  shoulders: ['Standing_Military_Press', 'Side_Lateral_Raise', 'Face_Pull'],
  biceps: ['Barbell_Curl', 'Hammer_Curls'],
  triceps: ['Triceps_Pushdown', 'Dips_-_Triceps_Version'],
  quads: ['Barbell_Squat', 'Leg_Press', 'Leg_Extensions'],
  hamstrings: ['Romanian_Deadlift', 'Lying_Leg_Curls'],
  glutes: ['Barbell_Hip_Thrust', 'Dumbbell_Lunges'],
  calves: ['Standing_Calf_Raises'],
  core: ['Plank'],
};

export interface SplitDayTemplate {
  name: string;
  groups: SplitGroup[];
  /** 0 = Sunday … 6 = Saturday. */
  weekdays: number[];
  repMin: number;
  repMax: number;
  /** How many default exercises to take from each group. */
  perGroup?: number;
}

export interface SplitPreset {
  id: string;
  name: string;
  daysPerWeek: number;
  description: string;
  days: SplitDayTemplate[];
}

const HYP = { repMin: 8, repMax: 12 };
const POWER = { repMin: 4, repMax: 6 };

export const SPLIT_PRESETS: SplitPreset[] = [
  {
    id: 'ppl',
    name: 'Push / Pull / Legs',
    daysPerWeek: 6,
    description: 'Each muscle twice a week. The most popular hypertrophy split.',
    days: [
      { name: 'Push', groups: ['chest', 'shoulders', 'triceps'], weekdays: [1, 4], ...HYP },
      { name: 'Pull', groups: ['back', 'biceps'], weekdays: [2, 5], ...HYP },
      { name: 'Legs', groups: ['quads', 'hamstrings', 'glutes', 'calves'], weekdays: [3, 6], ...HYP, perGroup: 2 },
    ],
  },
  {
    id: 'upper_lower',
    name: 'Upper / Lower',
    daysPerWeek: 4,
    description: 'Four days, balanced strength and size. Great on a cut.',
    days: [
      { name: 'Upper', groups: ['chest', 'back', 'shoulders', 'biceps', 'triceps'], weekdays: [1, 4], ...HYP, perGroup: 1 },
      { name: 'Lower', groups: ['quads', 'hamstrings', 'glutes', 'calves', 'core'], weekdays: [2, 5], ...HYP, perGroup: 1 },
    ],
  },
  {
    id: 'full_body',
    name: 'Full body ×3',
    daysPerWeek: 3,
    description: 'Three sessions, every muscle each time. Ideal for beginners and busy weeks.',
    days: [
      { name: 'Full body A', groups: ['quads', 'chest', 'back', 'core'], weekdays: [1], repMin: 6, repMax: 10, perGroup: 1 },
      { name: 'Full body B', groups: ['hamstrings', 'shoulders', 'back', 'biceps'], weekdays: [3], repMin: 6, repMax: 10, perGroup: 1 },
      { name: 'Full body C', groups: ['glutes', 'chest', 'triceps', 'calves'], weekdays: [5], repMin: 8, repMax: 12, perGroup: 1 },
    ],
  },
  {
    id: 'phul',
    name: 'PHUL',
    daysPerWeek: 4,
    description: 'Power Hypertrophy Upper Lower: heavy days and pump days.',
    days: [
      { name: 'Upper power', groups: ['chest', 'back', 'shoulders'], weekdays: [1], ...POWER, perGroup: 2 },
      { name: 'Lower power', groups: ['quads', 'hamstrings', 'calves'], weekdays: [2], ...POWER, perGroup: 2 },
      { name: 'Upper hypertrophy', groups: ['chest', 'back', 'shoulders', 'biceps', 'triceps'], weekdays: [4], ...HYP, perGroup: 1 },
      { name: 'Lower hypertrophy', groups: ['quads', 'hamstrings', 'glutes', 'calves'], weekdays: [5], ...HYP, perGroup: 2 },
    ],
  },
  {
    id: 'arnold',
    name: 'Arnold split',
    daysPerWeek: 6,
    description: 'Chest & back, shoulders & arms, legs, twice a week. High volume.',
    days: [
      { name: 'Chest & back', groups: ['chest', 'back'], weekdays: [1, 4], ...HYP },
      { name: 'Shoulders & arms', groups: ['shoulders', 'biceps', 'triceps'], weekdays: [2, 5], ...HYP, perGroup: 2 },
      { name: 'Legs', groups: ['quads', 'hamstrings', 'glutes', 'calves'], weekdays: [3, 6], ...HYP, perGroup: 2 },
    ],
  },
  {
    id: 'bro',
    name: 'Bro split',
    daysPerWeek: 5,
    description: 'One muscle group a day with lots of volume for each.',
    days: [
      { name: 'Chest', groups: ['chest'], weekdays: [1], ...HYP },
      { name: 'Back', groups: ['back'], weekdays: [2], ...HYP },
      { name: 'Shoulders', groups: ['shoulders', 'core'], weekdays: [3], ...HYP },
      { name: 'Arms', groups: ['biceps', 'triceps'], weekdays: [4], ...HYP },
      { name: 'Legs', groups: ['quads', 'hamstrings', 'glutes', 'calves'], weekdays: [5], ...HYP, perGroup: 2 },
    ],
  },
];

export function exercisesForDay(day: Pick<SplitDayTemplate, 'groups' | 'perGroup'>): string[] {
  const out: string[] = [];
  for (const g of day.groups) {
    for (const id of DEFAULT_EXERCISES[g].slice(0, day.perGroup ?? 3)) if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** The split group an exercise belongs to, by its primary muscles. */
export function groupForMuscles(primary: string[]): SplitGroup | null {
  for (const g of SPLIT_GROUPS) if (primary.some((m) => GROUP_MUSCLES[g].includes(m))) return g;
  return null;
}
