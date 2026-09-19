import type { CheckInAnswers, Readiness, ReadinessBand, TrainingLoad } from './readiness';

/**
 * Recovery from whatever is available: sleep (from the watch with its stages, or typed in), HRV and
 * resting heart rate against the person's own normal, how they feel (the check-in) and training load
 * from every session. Missing parts drop out and the rest are re-weighted, so a watch alone, a
 * check-in alone or both all give a score. With only a check-in it matches `readiness()`.
 */

export interface Trend {
  today: number;
  /** Earlier daily values from the same app, excluding today. */
  history: number[];
}

export interface SleepInput {
  hours: number;
  deepMin?: number | null;
  remMin?: number | null;
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

type Part = keyof Omit<CheckInAnswers, 'sleepHours'> | 'sleep' | 'hrv' | 'rhr';

/** Check-in weights match `readiness()`; HRV and resting heart rate add to them. */
const WEIGHTS: Record<Part, number> = { sleep: 25, sleepQuality: 15, soreness: 20, stress: 15, energy: 15, mood: 10, hrv: 30, rhr: 15 };
const FLAGS: Record<Part, string> = {
  sleep: 'Short sleep',
  sleepQuality: 'Poor sleep quality',
  soreness: 'Sore',
  stress: 'High stress',
  energy: 'Low energy',
  mood: 'Low mood',
  hrv: 'HRV below your normal',
  rhr: 'Resting heart rate up',
};
const FEEL: (keyof CheckInAnswers)[] = ['sleepQuality', 'soreness', 'stress', 'energy', 'mood'];
const INVERTED = new Set<keyof CheckInAnswers>(['soreness', 'stress']);

/** Baselines need about a week of readings before they mean anything. */
const MIN_HISTORY = 5;
/** Load ratio above which injury risk and fatigue climb. */
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

export function hoursLabel(h: number): string {
  const total = Math.round(h * 60);
  return total < 60 ? `${total}m` : `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, '0')}m`;
}

function sleepPart(s: SleepInput, need: number): { value: number; detail: string } {
  const duration = clamp((s.hours - (need - 4)) / 4);
  const asleepMin = s.hours * 60;
  if (s.deepMin != null && s.remMin != null && asleepMin > 0) {
    // Deep and REM usually make up about a third of a night; less than that is lighter recovery.
    const restorative = (s.deepMin + s.remMin) / asleepMin;
    return { value: duration * (0.85 + 0.15 * clamp(restorative / 0.33)), detail: `${hoursLabel(s.hours)} · ${Math.round(restorative * 100)}% deep and REM` };
  }
  return { value: duration, detail: hoursLabel(s.hours) };
}

function hrvPart(t: Trend): { value: number; detail: string } | null {
  // HRV is skewed, so compare on a log scale.
  const b = baseline(t.history.filter((x) => x > 0).map(Math.log));
  if (!b || t.today <= 0) return null;
  const z = (Math.log(t.today) - b.mean) / Math.max(b.sd, 0.05);
  const pct = Math.round((t.today / Math.exp(b.mean) - 1) * 100);
  const detail = `${Math.round(t.today)} ms · ${Math.abs(pct) < 5 ? 'around your normal' : `${Math.abs(pct)}% ${pct < 0 ? 'below' : 'above'} your normal`}`;
  // Your normal scores 0.75; each standard deviation below takes a quarter off, so one below is "moderate".
  return { value: clamp(0.75 + 0.25 * z), detail };
}

function rhrPart(t: Trend): { value: number; detail: string } | null {
  const b = baseline(t.history);
  if (!b || t.today <= 0) return null;
  const diff = Math.round(t.today - b.mean);
  const detail = `${Math.round(t.today)} bpm · ${Math.abs(diff) < 2 ? 'around your normal' : `${Math.abs(diff)} ${diff > 0 ? 'above' : 'below'} your normal`}`;
  // A resting heart rate 8 or more beats above normal usually means fatigue, illness or stress.
  return { value: clamp(1 - Math.max(0, t.today - b.mean - 1) / 7), detail };
}

const feelValue = (key: keyof CheckInAnswers, v: number) => {
  const scaled = (clamp(v, 1, 5) - 1) / 4;
  return INVERTED.has(key) ? 1 - scaled : scaled;
};

export function recoveryScore(inputs: RecoveryInputs): Recovery | null {
  const need = inputs.sleepNeed ?? 8;
  const parts: { key: Part; value: number }[] = [];
  const factors: RecoveryFactor[] = [];

  // A sleep time typed into the check-in overrides the watch.
  const sleep = inputs.checkIn?.sleepHours != null ? { hours: inputs.checkIn.sleepHours } : inputs.sleep;
  if (sleep) {
    const p = sleepPart(sleep, need);
    parts.push({ key: 'sleep', value: p.value });
    factors.push({ key: 'sleep', label: 'Sleep', detail: p.detail, value: p.value });
  }
  const hrv = inputs.hrv ? hrvPart(inputs.hrv) : null;
  if (hrv) {
    parts.push({ key: 'hrv', value: hrv.value });
    factors.push({ key: 'hrv', label: 'HRV', ...hrv });
  }
  const rhr = inputs.rhr ? rhrPart(inputs.rhr) : null;
  if (rhr) {
    parts.push({ key: 'rhr', value: rhr.value });
    factors.push({ key: 'rhr', label: 'Resting heart rate', ...rhr });
  }
  let feelTotal = 0;
  let feelWeight = 0;
  for (const key of FEEL) {
    const v = inputs.checkIn?.[key];
    if (v == null) continue;
    const value = feelValue(key, v);
    parts.push({ key: key as Part, value });
    feelTotal += WEIGHTS[key as Part] * value;
    feelWeight += WEIGHTS[key as Part];
  }
  if (feelWeight > 0) {
    const value = feelTotal / feelWeight;
    factors.push({ key: 'feel', label: 'How you feel', detail: value >= 0.75 ? 'Feeling good' : value >= 0.5 ? 'Feeling okay' : 'Feeling rough', value });
  }
  if (parts.length === 0) return null;

  const weight = parts.reduce((a, p) => a + WEIGHTS[p.key], 0);
  let score = (parts.reduce((a, p) => a + WEIGHTS[p.key] * p.value, 0) / weight) * 100;
  const flags = parts
    .map((p) => ({ key: p.key, loss: WEIGHTS[p.key] * (1 - p.value) }))
    .filter((l) => l.loss >= WEIGHTS[l.key] * 0.5)
    .sort((a, b) => b.loss - a.loss)
    .map((l) => FLAGS[l.key]);

  let loadNote: string | null = null;
  const load = inputs.load;
  if (load && load.chronic > 0) {
    const ratio = load.acute / load.chronic;
    loadNote = ratio > SPIKE_RATIO ? 'Much more training than usual' : ratio > 1.15 ? 'A bit more training than usual' : ratio < 0.7 ? 'Lighter week than usual' : 'Training load steady';
    if (ratio > SPIKE_RATIO) {
      score -= Math.min(10, (ratio - SPIKE_RATIO) * 20);
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
