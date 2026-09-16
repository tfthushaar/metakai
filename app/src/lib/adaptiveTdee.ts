import { daysBetween } from './dates';
import { KCAL_PER_KG } from './energy';
import type { TrendPoint } from './trend';

export interface IntakeDay {
  date: string;
  kcal: number;
}

export interface AdaptiveResult {
  tdee: number;
  /** 0–1: how much the measured value is trusted vs the formula. */
  confidence: number;
  daysUsed: number;
}

export const MIN_LOGGED_DAYS = 10;

/**
 * TDEE = average intake − stored energy change, over the last `windowDays`.
 * Blended with the formula estimate until enough days are logged.
 */
export function adaptiveTdee(
  intake: IntakeDay[],
  trend: TrendPoint[],
  formulaTdee: number,
  windowDays = 21,
): AdaptiveResult | null {
  if (trend.length < 2) return null;
  const end = trend[trend.length - 1];
  const start = trend[Math.max(0, trend.length - 1 - windowDays)];
  const span = daysBetween(start.date, end.date);
  const logged = intake.filter((d) => d.date > start.date && d.date <= end.date && d.kcal > 0);
  if (span < 7 || logged.length < MIN_LOGGED_DAYS) return null;

  const avgIntake = logged.reduce((s, d) => s + d.kcal, 0) / logged.length;
  const storedPerDay = ((end.trend - start.trend) * KCAL_PER_KG) / span;
  const measured = avgIntake - storedPerDay;
  const confidence = Math.min(1, logged.length / windowDays);
  return {
    tdee: Math.round(measured * confidence + formulaTdee * (1 - confidence)),
    confidence,
    daysUsed: logged.length,
  };
}
