import { addDays, daysBetween } from './dates';

export interface WeightPoint {
  date: string;
  kg: number;
}

export interface TrendPoint {
  date: string;
  /** Raw weigh-in for the day, if any. */
  kg: number | null;
  trend: number;
}

export const TREND_ALPHA = 0.1;

/**
 * Exponentially smoothed daily trend. Multiple weigh-ins on one day are averaged;
 * days without a weigh-in carry the trend forward unchanged.
 *
 * The average is bias-corrected: a plain moving average starts at the first weigh-in and takes
 * weeks to let go of it, so early on the trend lags far behind the scale. Dividing by the total
 * weight given so far makes the first few weigh-ins count properly; after a few weeks it is the
 * same as a plain exponential average.
 */
export function computeTrend(points: WeightPoint[], alpha = TREND_ALPHA): TrendPoint[] {
  if (points.length === 0) return [];
  const byDay = new Map<string, { sum: number; n: number }>();
  for (const p of points) {
    const cur = byDay.get(p.date) ?? { sum: 0, n: 0 };
    cur.sum += p.kg;
    cur.n += 1;
    byDay.set(p.date, cur);
  }
  const days = [...byDay.keys()].sort();
  const first = days[0];
  const last = days[days.length - 1];
  const out: TrendPoint[] = [];
  let sum = 0;
  let weight = 0;
  let trend = byDay.get(first)!.sum / byDay.get(first)!.n;
  const span = daysBetween(first, last);
  for (let i = 0; i <= span; i++) {
    const date = addDays(first, i);
    const entry = byDay.get(date);
    const kg = entry ? entry.sum / entry.n : null;
    if (kg != null) {
      sum = (1 - alpha) * sum + alpha * kg;
      weight = (1 - alpha) * weight + alpha;
      trend = sum / weight;
    }
    out.push({ date, kg, trend });
  }
  return out;
}

/** Change in trend weight per week over the last `windowDays` days. */
export function weeklyTrendChange(trend: TrendPoint[], windowDays = 14): number | null {
  if (trend.length < 2) return null;
  const end = trend[trend.length - 1];
  const startIndex = Math.max(0, trend.length - 1 - windowDays);
  const start = trend[startIndex];
  const days = daysBetween(start.date, end.date);
  if (days < 7) return null;
  return ((end.trend - start.trend) / days) * 7;
}
