import library from './data/exercises.json';

export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'bodyweight'
  | 'cable'
  | 'machine'
  | 'kettlebell'
  | 'band'
  | 'medicine_ball'
  | 'exercise_ball'
  | 'foam_roll'
  | 'ez_bar'
  | 'other';

export interface Exercise {
  id: string;
  name: string;
  primary: string[];
  secondary: string[];
  equipment: Equipment;
  category: string;
  mechanic: string;
  level: string;
  instructions: string[];
  imageCount: number;
  custom?: boolean;
}

interface RawExercise {
  id: string;
  n: string;
  p: string[];
  s: string[];
  e: string;
  c: string;
  m: string;
  l: string;
  i: string[];
  img: number;
}

const raw = library as { sha: string; exercises: RawExercise[] };

export const BUILTIN_EXERCISES: Exercise[] = raw.exercises.map((x) => ({
  id: x.id,
  name: x.n,
  primary: x.p,
  secondary: x.s,
  equipment: x.e as Equipment,
  category: x.c,
  mechanic: x.m,
  level: x.l,
  instructions: x.i,
  imageCount: x.img,
}));

const BY_ID = new Map(BUILTIN_EXERCISES.map((e) => [e.id, e]));

export function builtinExercise(id: string): Exercise | undefined {
  return BY_ID.get(id);
}

export function exerciseImageUrl(id: string, index = 0): string {
  return `https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@${raw.sha}/exercises/${encodeURIComponent(id)}/${index}.jpg`;
}

export const MUSCLE_GROUPS: { id: string; label: string; muscles: string[] }[] = [
  { id: 'chest', label: 'Chest', muscles: ['chest'] },
  { id: 'back', label: 'Back', muscles: ['lats', 'middle back', 'lower back', 'traps'] },
  { id: 'shoulders', label: 'Shoulders', muscles: ['shoulders'] },
  { id: 'arms', label: 'Arms', muscles: ['biceps', 'triceps', 'forearms'] },
  { id: 'legs', label: 'Legs', muscles: ['quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'] },
  { id: 'core', label: 'Core', muscles: ['abdominals'] },
];

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  bodyweight: 'Bodyweight',
  cable: 'Cable',
  machine: 'Machine',
  kettlebell: 'Kettlebell',
  band: 'Band',
  medicine_ball: 'Medicine ball',
  exercise_ball: 'Exercise ball',
  foam_roll: 'Foam roller',
  ez_bar: 'EZ bar',
  other: 'Other',
};

export const MUSCLE_LABEL = (m: string) => m.charAt(0).toUpperCase() + m.slice(1);

/** Popular lifts float to the top of search results and the default list. */
const POPULAR = new Set([
  'Barbell_Squat',
  'Barbell_Bench_Press_-_Medium_Grip',
  'Barbell_Deadlift',
  'Standing_Military_Press',
  'Bent_Over_Barbell_Row',
  'Pullups',
  'Chin-Up',
  'Dips_-_Triceps_Version',
  'Dumbbell_Bench_Press',
  'Incline_Dumbbell_Press',
  'Wide-Grip_Lat_Pulldown',
  'Seated_Cable_Rows',
  'Leg_Press',
  'Romanian_Deadlift',
  'Barbell_Hip_Thrust',
  'Dumbbell_Shoulder_Press',
  'Side_Lateral_Raise',
  'Barbell_Curl',
  'Dumbbell_Bicep_Curl',
  'Triceps_Pushdown',
  'Lying_Leg_Curls',
  'Leg_Extensions',
  'Standing_Calf_Raises',
  'Plank',
  'Pushups',
  'Face_Pull',
  'Hammer_Curls',
  'Dumbbell_Lunges',
  'Barbell_Incline_Bench_Press_-_Medium_Grip',
  'Cable_Crossover',
]);

export const isPopular = (id: string) => POPULAR.has(id);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function searchExercises(all: Exercise[], query: string, group: string | null, equipment: Equipment | null): Exercise[] {
  const q = norm(query);
  const words = q ? q.split(' ') : [];
  const muscles = group ? MUSCLE_GROUPS.find((g) => g.id === group)?.muscles ?? [] : null;
  const scored: { e: Exercise; score: number }[] = [];
  for (const e of all) {
    if (e.category === 'stretching' && !q) continue;
    if (muscles && !e.primary.some((m) => muscles.includes(m))) continue;
    if (equipment && e.equipment !== equipment) continue;
    let score = POPULAR.has(e.id) ? 2 : 0;
    if (e.custom) score += 3;
    if (words.length) {
      const name = norm(e.name);
      const hits = words.filter((w) => name.includes(w)).length;
      if (hits < words.length) continue;
      if (name.startsWith(q)) score += 4;
      score += hits;
    }
    scored.push({ e, score });
  }
  scored.sort((a, b) => b.score - a.score || a.e.name.localeCompare(b.e.name));
  return scored.map((s) => s.e);
}
