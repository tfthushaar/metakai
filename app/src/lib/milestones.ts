import { addDays, daysBetween } from './dates';
import type { PredictionPoint } from './prediction';
import type { TrendPoint } from './trend';

export interface WeightMilestone {
  index: number;
  targetKg: number;
  /** Whether this is the final goal. */
  isGoal: boolean;
  isHalfway: boolean;
  reachedDate: string | null;
  predictedDate: string | null;
  /** Kg changed since the previous milestone (signed). */
  deltaKg: number;
  daysTaken: number | null;
}

const round = (v: number, step = 0.5) => Math.round(v / step) * step;

/** Evenly spaced checkpoints from start to target, rounded to 0.5 kg. */
export function milestoneTargets(startKg: number, targetKg: number): number[] {
  const total = targetKg - startKg;
  const abs = Math.abs(total);
  if (abs < 0.5) return [targetKg];
  const count = Math.min(8, Math.max(2, Math.round(abs / 2)));
  const out: number[] = [];
  for (let i = 1; i <= count; i++) {
    const v = i === count ? targetKg : round(startKg + (total * i) / count);
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

function crossed(direction: number, value: number, target: number) {
  return direction < 0 ? value <= target + 1e-9 : value >= target - 1e-9;
}

export function weightMilestones(opts: {
  startKg: number;
  targetKg: number;
  startDate: string;
  trend: TrendPoint[];
  prediction: PredictionPoint[];
}): WeightMilestone[] {
  const { startKg, targetKg, startDate, trend, prediction } = opts;
  const direction = Math.sign(targetKg - startKg);
  const targets = milestoneTargets(startKg, targetKg);
  const since = trend.filter((t) => t.date >= startDate);
  const halfwayIndex = Math.ceil(targets.length / 2) - 1;

  let prevKg = startKg;
  let prevDate: string | null = startDate;
  return targets.map((target, index) => {
    const hit = since.find((t) => crossed(direction, t.trend, target));
    let predicted: string | null = null;
    for (let i = 1; i < prediction.length; i++) {
      const a = prediction[i - 1];
      const b = prediction[i];
      if (crossed(direction, b.expected, target)) {
        const span = b.expected - a.expected;
        const frac = span === 0 ? 1 : Math.min(1, Math.max(0, (target - a.expected) / span));
        predicted = addDays(a.date, Math.round(frac * daysBetween(a.date, b.date)));
        break;
      }
    }
    const milestone: WeightMilestone = {
      index,
      targetKg: target,
      isGoal: index === targets.length - 1,
      isHalfway: targets.length > 2 && index === halfwayIndex,
      reachedDate: hit?.date ?? null,
      predictedDate: predicted,
      deltaKg: target - prevKg,
      daysTaken: hit && prevDate ? daysBetween(prevDate, hit.date) : null,
    };
    prevKg = target;
    prevDate = hit?.date ?? null;
    return milestone;
  });
}

/** Time-based checkpoints for recomp and maintenance, where the scale is not the goal. */
export function timeMilestones(startDate: string, today: string, weeks = [2, 4, 8, 12, 16, 24]) {
  return weeks.map((w) => {
    const date = addDays(startDate, w * 7);
    return { weeks: w, date, reached: date <= today };
  });
}
