import type { CheckInAnswers, Readiness, ReadinessBand, TrainingLoad } from './readiness';

/**
 * Recovery from whatever is available: watch sleep (duration and stages), HRV and resting heart
 * rate against the person's own normal, how they feel (the check-in) and training load from every
 * session. Missing parts drop out and the rest are re-weighted, so a watch alone, a check-in alone
 * or both all give a score.
 */

export interface Trend {
  today: number;
  /** Earlier daily values, most recent last, excluding today. */
  history: number[];
}

export interface SleepInput {
  hours: number;
  deepMin?: number | null;
  remMin?: number | null;
  /** App the sleep came from, for display. */
  source?: string | null;
}

export interface RecoveryInputs {
  checkIn: CheckInAnswers | null;
  sleep: SleepInput | null;
  hrv: Trend | null;
  rhr: Trend | null;
  load: TrainingLoad | null;
  sleepNeed?: number;
}

export type FactorKey = 'sleep' | 'hrv' | 'rhr' | 'feel';

export interface RecoveryFactor {
  key: FactorKey;
  label: string;
  /** Plain-language reading, like "12% below your normal". */
  detail: string;
  /** 0 (drags the score down) to 1 (fully recovered). */
  value: number;
}

export interface Recovery extends Readiness {
  factors: RecoveryFactor[];
  /** Training load against the last four weeks, for display. */
  loadNote: string | null;
}

const WEIGHTS: Record<FactorKey, number> = { sleep: 35, hrv: 25, rhr: 15, feel: 25 };
/** Baselines need about a week of readings before they mean anything. */
const MIN_HISTORY = 5;
const SPIKE_RATIO = 1.5;

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

export interface Baseline {
  mean: number;
  sd: number;
  n: number;
}

export function baseline(values: number[]): Baseline | null {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < MIN_HISTORY) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
  return { mean, sd, n: v.length };
}

function sleepFactor(s: SleepInput, need: number): RecoveryFactor {
  const duration = clamp((s.hours - (need - 4)) / 4);
  let value = duration;
  let detail = `${Math.floor(s.hours)}h ${String(Math.round((s.hours % 1) * 60)).padStart(2, '0')}m`;
  const asleepMin = s.hours * 60;
  if (s.deepMin != null && s.remMin != null && asleepMin > 0) {
    // Deep and REM usually make up about a third of a night; less than that is lighter recovery.
    const restorative = (s.deepMin + s.remMin) / asleepMin;
    value = duration * (0.85 + 0.15 * clamp(restorative / 0.33));
    detail += ` · ${Math.round(restorative * 100)}% deep and REM`;
  }
  return { key: 'sleep', label: 'Sleep', detail, value };
}

function hrvFactor(t: Trend): RecoveryFactor | null {
  // HRV is skewed, so compare on a log scale.
  const b = baseline(t.history.filter((x) => x > 0).map(Math.log));
  if (!b || t.today <= 0) return null;
  const z = (Math.log(t.today) - b.mean) / Math.max(b.sd, 0.05);
  const pct = Math.round((t.today / Math.exp(b.mean) - 1) * 100);
  const detail = `${Math.round(t.today)} ms · ${Math.abs(pct) < 5 ? 'around your normal' : `${Math.abs(pct)}% ${pct < 0 ? 'below' : 'above'} your normal`}`;
  return { key: 'hrv', label: 'HRV', detail, value: clamp((z + 1.5) / 2) };
}

function rhrFactor(t: Trend): RecoveryFactor | null {
  const b = baseline(t.history);
  if (!b || t.today <= 0) return null;
  const diff = Math.round(t.today - b.mean);
  const detail = `${Math.round(t.today)} bpm · ${Math.abs(diff) < 2 ? 'around your normal' : `${Math.abs(diff)} ${diff > 0 ? 'above' : 'below'} your normal`}`;
  // A resting heart rate 8 or more beats above normal usually means fatigue, illness or stress.
  return { key: 'rhr', label: 'Resting heart rate', detail, value: clamp(1 - Math.max(0, t.today - b.mean - 1) / 7) };
}

const FEEL_WEIGHTS: [keyof CheckInAnswers, number, boolean][] = [
  ['sleepQuality', 15, false],
  ['soreness', 20, true],
  ['stress', 15, true],
  ['energy', 15, false],
  ['mood', 10, false],
];
const FEEL_FLAGS: Partial<Record<keyof CheckInAnswers, string>> = {
  sleepQuality: 'Poor sleep quality',
  soreness: 'Sore',
  stress: 'High stress',
  energy: 'Low energy',
  mood: 'Low mood',
};

function feelFactor(c: CheckInAnswers): { factor: RecoveryFactor; worst: string | null } | null {
  let total = 0;
  let weight = 0;
  let worst: { name: string; value: number } | null = null;
  for (const [key, w, inverted] of FEEL_WEIGHTS) {
    const v = c[key];
    if (v == null) continue;
    const scaled = (clamp(v, 1, 5) - 1) / 4;
    const value = inverted ? 1 - scaled : scaled;
    total += w * value;
    weight += w;
    if (!worst || value < worst.value) worst = { name: FEEL_FLAGS[key]!, value };
  }
  if (weight === 0) return null;
  const value = total / weight;
  return {
    factor: { key: 'feel', label: 'How you feel', detail: value >= 0.75 ? 'Feeling good' : value >= 0.5 ? 'Feeling okay' : 'Feeling rough', value },
    worst: worst && worst.value < 0.5 ? worst.name : null,
  };
}

export function recoveryScore(inputs: RecoveryInputs): Recovery | null {
  const need = inputs.sleepNeed ?? 8;
  const factors: RecoveryFactor[] = [];
  const flags: string[] = [];

  // A sleep time typed into the check-in overrides the watch.
  const sleep = inputs.checkIn?.sleepHours != null ? { hours: inputs.checkIn.sleepHours } : inputs.sleep;
  if (sleep) factors.push(sleepFactor(sleep, need));
  const hrv = inputs.hrv ? hrvFactor(inputs.hrv) : null;
  if (hrv) factors.push(hrv);
  const rhr = inputs.rhr ? rhrFactor(inputs.rhr) : null;
  if (rhr) factors.push(rhr);
  const feel = inputs.checkIn ? feelFactor(inputs.checkIn) : null;
  if (feel) factors.push(feel.factor);
  if (factors.length === 0) return null;

  const weight = factors.reduce((a, f) => a + WEIGHTS[f.key], 0);
  let score = (factors.reduce((a, f) => a + WEIGHTS[f.key] * f.value, 0) / weight) * 100;

  for (const f of [...factors].sort((a, b) => a.value - b.value)) {
    if (f.value >= 0.5) continue;
    if (f.key === 'sleep') flags.push(sleep && sleep.hours < need - 1 ? 'Short sleep' : 'Light sleep');
    if (f.key === 'hrv') flags.push('HRV below your normal');
    if (f.key === 'rhr') flags.push('Resting heart rate up');
    if (f.key === 'feel' && feel?.worst) flags.push(feel.worst);
  }

  let loadNote: string | null = null;
  const load = inputs.load;
  if (load && load.chronic > 0) {
    const ratio = load.acute / load.chronic;
    loadNote = ratio > SPIKE_RATIO ? 'Much more training than usual' : ratio > 1.15 ? 'A bit more training than usual' : ratio < 0.7 ? 'Lighter week than usual' : 'Training load steady';
    if (ratio > SPIKE_RATIO) {
      score -= Math.min(12, (ratio - SPIKE_RATIO) * 25);
      flags.push('Training load spiked');
    }
  }

  score = Math.round(clamp(score, 0, 100));
  const band: ReadinessBand = score >= 75 ? 'high' : score >= 50 ? 'moderate' : 'low';
  const advice =
    band === 'high'
      ? 'Good day to push. Go for your planned weights or a PR.'
      : band === 'moderate'
        ? 'Train as planned, but stop a rep or two shy of failure.'
        : 'Go lighter today: fewer sets, easy cardio, or a rest day.';
  return { score, band, flags, advice, factors, loadNote };
}

/* ---------------- training load ---------------- */

export interface LoadSession {
  /** Local day the session happened, YYYY-MM-DD. */
  dateKey: string;
  minutes: number;
  avgHr?: number | null;
  /** Effort 1–10, for sessions without heart rate. */
  rpe?: number | null;
  /** Working sets, for gym sessions without heart rate. */
  sets?: number | null;
  strength: boolean;
}

/**
 * Training impulse for one session: minutes weighted by intensity (Banister's TRIMP when heart
 * rate is known). Gym sessions without heart rate count their working sets; other sessions use effort.
 */
export function sessionLoad(s: LoadSession, heart: { rest: number; max: number }): number {
  const trimp = (x: number) => s.minutes * x * 0.64 * Math.exp(1.92 * x);
  if (s.avgHr && heart.max > heart.rest) return trimp(clamp((s.avgHr - heart.rest) / (heart.max - heart.rest)));
  if (s.strength) return s.sets != null && s.sets > 0 ? s.sets * 2.5 : s.minutes * 0.9;
  return trimp(clamp((s.rpe ?? 6) / 10));
}

/** Daily load over the last 7 days (acute) against the last 28 (chronic). Needs two weeks of history. */
export function trainingLoad(sessions: LoadSession[], today: string, heart: { rest: number; max: number }): TrainingLoad | null {
  const dayMs = 86400_000;
  const t = Date.parse(`${today}T12:00:00`);
  const age = (d: string) => Math.round((t - Date.parse(`${d}T12:00:00`)) / dayMs);
  const past = sessions.filter((s) => age(s.dateKey) >= 0 && age(s.dateKey) < 28);
  const oldest = Math.max(-1, ...sessions.map((s) => age(s.dateKey)));
  if (oldest < 14 || past.length === 0) return null;
  const sum = (days: number) => past.filter((s) => age(s.dateKey) < days).reduce((a, s) => a + sessionLoad(s, heart), 0);
  return { acute: sum(7) / 7, chronic: sum(28) / 28 };
}
