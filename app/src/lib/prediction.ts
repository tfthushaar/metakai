import { addDays } from './dates';
import { estimateTdee, KCAL_PER_KG, type BodyInput } from './energy';
import { GOALS, type GoalType } from './goals';

export interface PredictionPoint {
  date: string;
  expected: number;
  low: number;
  high: number;
}

export interface PredictionInput extends BodyInput {
  goal: GoalType;
  startDate: string;
  targetKg?: number | null;
  /** Planned daily intake. */
  intakeKcal: number;
  /** Measured TDEE at the start; overrides the formula when present. */
  adaptiveTdee?: number | null;
  maxWeeks?: number;
}

export interface Prediction {
  points: PredictionPoint[];
  /** First date the expected curve reaches the target, if it does. */
  etaDate: string | null;
  weeks: number;
}

const BAND_TDEE = 0.05;
const MAINTAIN_BAND_KG = 1;

function simulate(input: PredictionInput, tdeeScale: number, weeks: number): number[] {
  const formulaStart = estimateTdee(input);
  const offset = (input.adaptiveTdee ?? formulaStart) - formulaStart;
  const out = [input.weightKg];
  let w = input.weightKg;
  for (let i = 0; i < weeks; i++) {
    // Body fat % held constant so lean mass scales with weight.
    const tdee = (estimateTdee({ ...input, weightKg: w }) + offset) * tdeeScale;
    w += ((input.intakeKcal - tdee) * 7) / KCAL_PER_KG;
    out.push(w);
  }
  return out;
}

/**
 * Week-by-week simulation at a fixed intake. TDEE is recalculated as weight changes,
 * so cuts and bulks flatten over time. Recomp and maintenance return a flat band.
 */
export function predict(input: PredictionInput): Prediction {
  const def = GOALS[input.goal];
  const maxWeeks = input.maxWeeks ?? 52;

  if (def.direction === 0) {
    const weeks = Math.min(maxWeeks, 16);
    const points: PredictionPoint[] = [];
    for (let i = 0; i <= weeks; i++) {
      points.push({
        date: addDays(input.startDate, i * 7),
        expected: input.weightKg,
        low: input.weightKg - MAINTAIN_BAND_KG,
        high: input.weightKg + MAINTAIN_BAND_KG,
      });
    }
    return { points, etaDate: null, weeks };
  }

  const expected = simulate(input, 1, maxWeeks);
  const fast = simulate(input, 1 + BAND_TDEE, maxWeeks);
  const slow = simulate(input, 1 - BAND_TDEE, maxWeeks);

  let etaWeek: number | null = null;
  if (input.targetKg != null) {
    for (let i = 0; i < expected.length; i++) {
      const reached = def.direction < 0 ? expected[i] <= input.targetKg : expected[i] >= input.targetKg;
      if (reached) {
        etaWeek = i;
        break;
      }
    }
  }

  const weeks = etaWeek != null ? Math.min(maxWeeks, etaWeek + 2) : maxWeeks;
  const points: PredictionPoint[] = [];
  for (let i = 0; i <= weeks; i++) {
    const a = fast[i];
    const b = slow[i];
    points.push({
      date: addDays(input.startDate, i * 7),
      expected: expected[i],
      low: Math.min(a, b),
      high: Math.max(a, b),
    });
  }
  return {
    points,
    etaDate: etaWeek != null ? addDays(input.startDate, etaWeek * 7) : null,
    weeks,
  };
}

/** Expected weight on a given date by linear interpolation between weekly points. */
export function expectedOn(prediction: Prediction, date: string): number | null {
  const pts = prediction.points;
  if (pts.length === 0 || date < pts[0].date) return null;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (date >= a.date && date <= b.date) {
      const total = new Date(b.date).getTime() - new Date(a.date).getTime();
      const part = new Date(date).getTime() - new Date(a.date).getTime();
      return a.expected + ((b.expected - a.expected) * part) / total;
    }
  }
  return pts[pts.length - 1].expected;
}
