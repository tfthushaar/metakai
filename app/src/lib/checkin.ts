import type { IntakeDay } from './adaptiveTdee';
import { addDays, daysBetween } from './dates';
import type { TrendPoint } from './trend';

export interface CheckinInput {
  weekEnd: string;
  intake: IntakeDay[];
  trend: TrendPoint[];
  targetKcal: number;
  targetProtein: number;
  proteinByDay: { date: string; protein: number }[];
  /** Planned weekly change in kg (negative for a cut). 0 for maintenance goals. */
  plannedWeeklyKg: number;
  workouts: number;
  plannedWorkouts: number;
}

export type Verdict = 'on_track' | 'too_slow' | 'too_fast' | 'wrong_direction' | 'not_enough_data' | 'holding' | 'drifting';

export interface Checkin {
  weekStart: string;
  weekEnd: string;
  daysLogged: number;
  avgKcal: number | null;
  kcalAdherence: number | null;
  proteinDaysHit: number;
  weeklyChangeKg: number | null;
  plannedWeeklyKg: number;
  verdict: Verdict;
  headline: string;
  suggestion: string | null;
  /** Suggested daily calorie change, if any. */
  kcalAdjustment: number;
  workouts: number;
  plannedWorkouts: number;
}

/** Summarises the 7 days ending on `weekEnd` and suggests a calorie adjustment. */
export function weeklyCheckin(input: CheckinInput): Checkin {
  const weekStart = addDays(input.weekEnd, -6);
  const inWeek = (d: string) => d >= weekStart && d <= input.weekEnd;
  const logged = input.intake.filter((d) => inWeek(d.date) && d.kcal > 0);
  const avgKcal = logged.length ? logged.reduce((s, d) => s + d.kcal, 0) / logged.length : null;
  const kcalAdherence = avgKcal != null ? logged.filter((d) => Math.abs(d.kcal - input.targetKcal) <= input.targetKcal * 0.1).length / 7 : null;
  const proteinDaysHit = input.proteinByDay.filter((d) => inWeek(d.date) && d.protein >= input.targetProtein * 0.95).length;

  // Trend change over the week (fall back to the longest span available up to 14 days).
  const end = [...input.trend].reverse().find((t) => t.date <= input.weekEnd);
  const start = input.trend.find((t) => t.date >= addDays(input.weekEnd, -7));
  let weeklyChangeKg: number | null = null;
  if (end && start && daysBetween(start.date, end.date) >= 5) {
    weeklyChangeKg = ((end.trend - start.trend) / daysBetween(start.date, end.date)) * 7;
  }

  const base = { weekStart, weekEnd: input.weekEnd, daysLogged: logged.length, avgKcal, kcalAdherence, proteinDaysHit, weeklyChangeKg, plannedWeeklyKg: input.plannedWeeklyKg, workouts: input.workouts, plannedWorkouts: input.plannedWorkouts };

  if (weeklyChangeKg == null || logged.length < 4) {
    return { ...base, verdict: 'not_enough_data', headline: 'Not enough data yet', suggestion: 'Log food on at least 4 days and weigh in most mornings to get a check-in.', kcalAdjustment: 0 };
  }

  const planned = input.plannedWeeklyKg;
  const adherent = kcalAdherence != null && kcalAdherence >= 4 / 7;

  if (planned === 0) {
    if (Math.abs(weeklyChangeKg) <= 0.25) return { ...base, verdict: 'holding', headline: 'Weight is holding steady', suggestion: null, kcalAdjustment: 0 };
    const adj = weeklyChangeKg > 0 ? -100 : 100;
    return {
      ...base,
      verdict: 'drifting',
      headline: weeklyChangeKg > 0 ? 'Weight is drifting up' : 'Weight is drifting down',
      suggestion: adherent ? `Adjust calories by ${adj > 0 ? '+' : ''}${adj} a day to hold steady.` : 'Hit your calorie target more consistently before changing it.',
      kcalAdjustment: adherent ? adj : 0,
    };
  }

  const ratio = weeklyChangeKg / planned;
  const cutting = planned < 0;
  if (ratio < 0) {
    return {
      ...base,
      verdict: 'wrong_direction',
      headline: cutting ? 'Weight went up this week' : 'Weight went down this week',
      suggestion: adherent
        ? `Your maintenance is likely ${cutting ? 'lower' : 'higher'} than estimated. Try ${cutting ? '−150' : '+150'} kcal a day.`
        : 'Water and salt swing the scale. Stay consistent for another week before changing targets.',
      kcalAdjustment: adherent ? (cutting ? -150 : 150) : 0,
    };
  }
  if (ratio < 0.5) {
    return {
      ...base,
      verdict: 'too_slow',
      headline: cutting ? 'Losing slower than planned' : 'Gaining slower than planned',
      suggestion: adherent ? `Try ${cutting ? '−100' : '+100'} kcal a day for the next two weeks.` : 'Focus on hitting your calorie target before adjusting it.',
      kcalAdjustment: adherent ? (cutting ? -100 : 100) : 0,
    };
  }
  if (ratio > 1.6) {
    return {
      ...base,
      verdict: 'too_fast',
      headline: cutting ? 'Losing faster than planned' : 'Gaining faster than planned',
      suggestion: cutting ? 'Faster loss risks muscle. Add about 100 kcal a day.' : 'Faster gain is mostly fat. Remove about 100 kcal a day.',
      kcalAdjustment: cutting ? 100 : -100,
    };
  }
  return { ...base, verdict: 'on_track', headline: 'Right on track', suggestion: null, kcalAdjustment: 0 };
}
