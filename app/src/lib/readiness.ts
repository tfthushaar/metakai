/**
 * Daily readiness from a short check-in plus recent training load.
 * Scales are 1–5. For soreness and stress, 1 is none/low; for the rest, 5 is best.
 */
export interface CheckInAnswers {
  sleepHours: number | null;
  sleepQuality: number | null;
  soreness: number | null;
  stress: number | null;
  energy: number | null;
  mood: number | null;
}

/** Average hard sets per day: last 3 days (acute) vs last 28 days (chronic). */
export interface TrainingLoad {
  acute: number;
  chronic: number;
}

export type ReadinessBand = 'high' | 'moderate' | 'low';

export interface Readiness {
  score: number;
  band: ReadinessBand;
  /** Biggest drags on the score, worst first. */
  flags: string[];
  advice: string;
}

const WEIGHTS: Record<keyof CheckInAnswers, number> = {
  sleepHours: 25,
  sleepQuality: 15,
  soreness: 20,
  stress: 15,
  energy: 15,
  mood: 10,
};

const FLAG: Record<keyof CheckInAnswers, string> = {
  sleepHours: 'Short sleep',
  sleepQuality: 'Poor sleep quality',
  soreness: 'Sore',
  stress: 'High stress',
  energy: 'Low energy',
  mood: 'Low mood',
};

const scale = (v: number) => (Math.min(5, Math.max(1, v)) - 1) / 4;

function factor(key: keyof CheckInAnswers, value: number, sleepTarget: number): number {
  switch (key) {
    case 'sleepHours':
      return Math.min(1, Math.max(0, (value - (sleepTarget - 4)) / 4));
    case 'soreness':
    case 'stress':
      return 1 - scale(value);
    default:
      return scale(value);
  }
}

/** Load ratio above which injury risk and fatigue climb. */
const SPIKE_RATIO = 1.5;

export function readiness(answers: CheckInAnswers, load: TrainingLoad | null = null, sleepTarget = 8): Readiness | null {
  let weight = 0;
  let total = 0;
  const losses: { key: keyof CheckInAnswers; loss: number }[] = [];
  for (const key of Object.keys(WEIGHTS) as (keyof CheckInAnswers)[]) {
    const v = answers[key];
    if (v == null) continue;
    const f = factor(key, v, sleepTarget);
    weight += WEIGHTS[key];
    total += WEIGHTS[key] * f;
    losses.push({ key, loss: WEIGHTS[key] * (1 - f) });
  }
  if (weight === 0) return null;

  let score = (total / weight) * 100;
  const flags = losses
    .filter((l) => l.loss >= WEIGHTS[l.key] * 0.5)
    .sort((a, b) => b.loss - a.loss)
    .map((l) => FLAG[l.key]);

  if (load && load.chronic > 0) {
    const ratio = load.acute / load.chronic;
    if (ratio > SPIKE_RATIO) {
      score -= Math.min(10, (ratio - SPIKE_RATIO) * 20);
      flags.push('Training load spiked');
    }
  }

  score = Math.round(Math.min(100, Math.max(0, score)));
  const band: ReadinessBand = score >= 75 ? 'high' : score >= 50 ? 'moderate' : 'low';
  const advice =
    band === 'high'
      ? 'Good day to push. Go for your planned weights or a PR.'
      : band === 'moderate'
        ? 'Train as planned, but stop a rep or two shy of failure.'
        : 'Go lighter today: fewer sets, easy cardio, or a rest day.';
  return { score, band, flags, advice };
}
