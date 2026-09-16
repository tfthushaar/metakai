import { estimate1RM } from './strength';

/**
 * MET values for resistance training (Compendium of Physical Activities):
 * light/moderate effort 3.5, vigorous 5.0, circuit-style with short rests 6.0.
 */
export function resistanceMet(workingSets: number, durationMin: number): number {
  if (durationMin <= 0) return 3.5;
  const setsPerHour = (workingSets / durationMin) * 60;
  if (setsPerHour >= 24) return 6.0;
  if (setsPerHour >= 14) return 5.0;
  return 3.5;
}

/** Typical session length when only sets are known: about 2.5 minutes per set plus warm-up. */
export function estimateDurationMin(workingSets: number): number {
  return Math.round(workingSets * 2.5 + 5);
}

export function workoutCalories(opts: { bodyweightKg: number; durationMin: number; workingSets: number }): number {
  const { bodyweightKg, durationMin, workingSets } = opts;
  if (bodyweightKg <= 0 || durationMin <= 0) return 0;
  return Math.round(resistanceMet(workingSets, durationMin) * bodyweightKg * (durationMin / 60));
}

/* ---------------- progressive overload ---------------- */

export type OverloadStatus = 'progressing' | 'holding' | 'slipping' | 'new';

export interface OverloadSession {
  date: string;
  sets: { weightKg: number | null; reps: number | null }[];
}

export interface OverloadResult {
  status: OverloadStatus;
  /** Best estimated 1RM in the latest session. */
  current: number;
  /** Best estimated 1RM across the earlier comparison sessions. */
  previous: number | null;
  changePct: number | null;
  /** Session-by-session best e1RM, oldest first. */
  series: number[];
}

const bestE1rm = (s: OverloadSession) =>
  Math.max(0, ...s.sets.filter((x) => x.weightKg != null && x.reps != null && x.reps > 0).map((x) => estimate1RM(x.weightKg!, x.reps!)));

/**
 * Compares the latest session with the average of the up-to-three sessions before it.
 * ±1% counts as holding; the estimated 1RM includes bodyweight-free sets as zero.
 */
export function overloadStatus(sessionsNewestFirst: OverloadSession[]): OverloadResult {
  const series = [...sessionsNewestFirst].reverse().map(bestE1rm).filter((v) => v > 0);
  const current = series[series.length - 1] ?? 0;
  if (series.length < 2) return { status: 'new', current, previous: null, changePct: null, series };
  const earlier = series.slice(Math.max(0, series.length - 4), series.length - 1);
  const previous = earlier.reduce((s, v) => s + v, 0) / earlier.length;
  const changePct = ((current - previous) / previous) * 100;
  const status: OverloadStatus = changePct >= 1 ? 'progressing' : changePct <= -2 ? 'slipping' : 'holding';
  return { status, current, previous, changePct, series };
}
