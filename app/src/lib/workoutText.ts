/**
 * Parses quick workout notes such as
 *   "bench 3x8 60, squat 5x5 100kg"
 *   "deadlift 100x5 120x3 140x1"
 *   "pullups 3 sets of 10; curls 3x12 @ 12.5"
 * into exercises with individual sets. Exercise names are returned as typed and
 * matched separately.
 */

export interface ParsedSet {
  weightKg: number | null;
  reps: number;
}

export interface ParsedExercise {
  name: string;
  sets: ParsedSet[];
}

const LB_TO_KG = 0.45359237;

function toKg(value: number, unit: string | undefined, defaultUnit: 'kg' | 'lb'): number {
  const u = unit?.toLowerCase() ?? defaultUnit;
  return u.startsWith('lb') ? Math.round(value * LB_TO_KG * 100) / 100 : value;
}

export function parseWorkoutText(text: string, defaultUnit: 'kg' | 'lb' = 'kg'): ParsedExercise[] {
  const out: ParsedExercise[] = [];
  const segments = text
    .split(/[\n;]/)
    .flatMap((line) => line.split(/,\s*(?=[a-z])/i))
    .map((s) => s.trim())
    .filter(Boolean);

  for (const segment of segments) {
    const firstDigit = segment.search(/\d/);
    if (firstDigit <= 0) continue;
    const name = segment
      .slice(0, firstDigit)
      .replace(/[:\-–@]+\s*$/, '')
      .trim();
    if (!name) continue;
    const rest = segment.slice(firstDigit).toLowerCase().replace(/×|\*/g, 'x');

    const sets: ParsedSet[] = [];
    // A trailing or "@" weight applies to sets×reps notation.
    const atWeight = rest.match(/@\s*(\d+(?:\.\d+)?)\s*(kg|kgs|lb|lbs)?/);
    const unitWeight = rest.match(/(\d+(?:\.\d+)?)\s*(kg|kgs|lb|lbs)\b/);

    // "3 sets of 8"
    const setsOf = rest.match(/(\d+)\s*sets?\s*(?:of|x)\s*(\d+)/);
    if (setsOf) {
      const w = atWeight ?? unitWeight ?? rest.slice((setsOf.index ?? 0) + setsOf[0].length).match(/(\d+(?:\.\d+)?)\s*(kg|lb)?/);
      const weight = w ? toKg(Number(w[1]), w[2], defaultUnit) : null;
      for (let i = 0; i < Number(setsOf[1]); i++) sets.push({ weightKg: weight, reps: Number(setsOf[2]) });
      out.push({ name, sets });
      continue;
    }

    const pairs = [...rest.matchAll(/(\d+(?:\.\d+)?)\s*(kg|kgs|lb|lbs)?\s*x\s*(\d+)(?:\s*x\s*(\d+(?:\.\d+)?)\s*(kg|kgs|lb|lbs)?)?/g)];
    let consumedEnd = 0;
    for (const p of pairs) {
      const a = Number(p[1]);
      const b = Number(p[3]);
      consumedEnd = (p.index ?? 0) + p[0].length;
      if (p[4] != null) {
        // "3x8x60" → sets × reps × weight
        for (let i = 0; i < a; i++) sets.push({ weightKg: toKg(Number(p[4]), p[5], defaultUnit), reps: b });
      } else if (p[2] || a > 12) {
        // "60x8" or "60kg x 8" → one set at that weight
        sets.push({ weightKg: toKg(a, p[2], defaultUnit), reps: b });
      } else {
        // "3x8" → sets × reps, weight given separately (or bodyweight)
        const after = rest.slice(consumedEnd).match(/^\s*(?:@\s*)?(\d+(?:\.\d+)?)\s*(kg|kgs|lb|lbs)?/);
        const w = atWeight ?? (after && !/^\s*\d+(\.\d+)?\s*x/.test(rest.slice(consumedEnd)) ? after : null) ?? unitWeight;
        const weight = w ? toKg(Number(w[1]), w[2], defaultUnit) : null;
        if (after && w === after) consumedEnd += after[0].length;
        for (let i = 0; i < a; i++) sets.push({ weightKg: weight, reps: b });
      }
    }
    if (sets.length === 0) {
      // "plank 60" or "pushups 20": one set of that many reps
      const single = rest.match(/(\d+)/);
      if (single) sets.push({ weightKg: null, reps: Number(single[1]) });
    }
    if (sets.length) out.push({ name, sets });
  }
  return out;
}

/** Common gym shorthand mapped to library exercise ids. */
export const EXERCISE_ALIASES: Record<string, string> = {
  bench: 'Barbell_Bench_Press_-_Medium_Grip',
  'bench press': 'Barbell_Bench_Press_-_Medium_Grip',
  'incline bench': 'Barbell_Incline_Bench_Press_-_Medium_Grip',
  'db bench': 'Dumbbell_Bench_Press',
  'dumbbell bench': 'Dumbbell_Bench_Press',
  'incline db': 'Incline_Dumbbell_Press',
  'incline dumbbell press': 'Incline_Dumbbell_Press',
  squat: 'Barbell_Squat',
  squats: 'Barbell_Squat',
  'back squat': 'Barbell_Squat',
  deadlift: 'Barbell_Deadlift',
  deadlifts: 'Barbell_Deadlift',
  dl: 'Barbell_Deadlift',
  rdl: 'Romanian_Deadlift',
  'romanian deadlift': 'Romanian_Deadlift',
  ohp: 'Standing_Military_Press',
  'overhead press': 'Standing_Military_Press',
  'military press': 'Standing_Military_Press',
  'shoulder press': 'Dumbbell_Shoulder_Press',
  row: 'Bent_Over_Barbell_Row',
  rows: 'Bent_Over_Barbell_Row',
  'barbell row': 'Bent_Over_Barbell_Row',
  'cable row': 'Seated_Cable_Rows',
  'seated row': 'Seated_Cable_Rows',
  pullups: 'Pullups',
  pullup: 'Pullups',
  'pull ups': 'Pullups',
  'pull-ups': 'Pullups',
  chinups: 'Chin-Up',
  'chin ups': 'Chin-Up',
  dips: 'Dips_-_Triceps_Version',
  pulldown: 'Wide-Grip_Lat_Pulldown',
  'lat pulldown': 'Wide-Grip_Lat_Pulldown',
  pulldowns: 'Wide-Grip_Lat_Pulldown',
  'leg press': 'Leg_Press',
  'hip thrust': 'Barbell_Hip_Thrust',
  'hip thrusts': 'Barbell_Hip_Thrust',
  curls: 'Dumbbell_Bicep_Curl',
  curl: 'Dumbbell_Bicep_Curl',
  'bicep curl': 'Dumbbell_Bicep_Curl',
  'barbell curl': 'Barbell_Curl',
  'hammer curl': 'Hammer_Curls',
  'hammer curls': 'Hammer_Curls',
  pushdown: 'Triceps_Pushdown',
  pushdowns: 'Triceps_Pushdown',
  'tricep pushdown': 'Triceps_Pushdown',
  'lateral raise': 'Side_Lateral_Raise',
  'lateral raises': 'Side_Lateral_Raise',
  laterals: 'Side_Lateral_Raise',
  'leg curl': 'Lying_Leg_Curls',
  'leg curls': 'Lying_Leg_Curls',
  'leg extension': 'Leg_Extensions',
  'leg extensions': 'Leg_Extensions',
  'calf raise': 'Standing_Calf_Raises',
  'calf raises': 'Standing_Calf_Raises',
  'face pull': 'Face_Pull',
  'face pulls': 'Face_Pull',
  lunges: 'Dumbbell_Lunges',
  lunge: 'Dumbbell_Lunges',
  plank: 'Plank',
  pushups: 'Pushups',
  'push ups': 'Pushups',
  'cable fly': 'Cable_Crossover',
  flyes: 'Cable_Crossover',
};
