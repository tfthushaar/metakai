/** Estimated one-rep max. Epley for higher reps, Brzycki for low reps; exact at 1 rep. */
export function estimate1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  if (reps <= 10) return (weight * 36) / (37 - reps);
  return weight * (1 + reps / 30);
}

/** Weight for a target rep count from a 1RM (inverse Brzycki / Epley). */
export function weightForReps(oneRm: number, reps: number): number {
  if (reps <= 1) return oneRm;
  if (reps <= 10) return (oneRm * (37 - reps)) / 36;
  return oneRm / (1 + reps / 30);
}

export const PERCENT_TABLE = [100, 95, 90, 85, 80, 75, 70, 65, 60, 50];

export function roundTo(value: number, increment: number): number {
  return Math.round(value / increment) * increment;
}

export interface PlateLoad {
  /** Plates for one side, heaviest first. */
  perSide: number[];
  /** Weight actually achievable with the given plates. */
  achieved: number;
  remainder: number;
}

/** Greedy plate loading with a finite count of each plate (pairs available). */
export function plateLoad(target: number, bar: number, plates: { weight: number; pairs: number }[]): PlateLoad {
  let perSideTarget = Math.max(0, (target - bar) / 2);
  const perSide: number[] = [];
  const sorted = [...plates].sort((a, b) => b.weight - a.weight);
  for (const p of sorted) {
    let count = 0;
    while (count < p.pairs && perSideTarget + 1e-9 >= p.weight) {
      perSide.push(p.weight);
      perSideTarget -= p.weight;
      count += 1;
    }
  }
  const loaded = perSide.reduce((s, w) => s + w, 0) * 2;
  const achieved = Math.max(bar, bar + loaded);
  return { perSide, achieved, remainder: Math.max(0, target - achieved) };
}

export interface WarmupSet {
  weight: number;
  reps: number;
}

/** Ramp-up sets toward a working weight, rounded to the loadable increment. */
export function warmupSets(working: number, bar: number, increment: number): WarmupSet[] {
  if (working <= bar * 1.2) return [{ weight: bar, reps: 10 }];
  const steps: [number, number][] = [
    [0, 10],
    [0.5, 5],
    [0.7, 3],
    [0.85, 1],
  ];
  const out: WarmupSet[] = [];
  for (const [pct, reps] of steps) {
    const w = pct === 0 ? bar : Math.max(bar, roundTo(working * pct, increment));
    if (w >= working) break;
    if (out.length && out[out.length - 1].weight === w) continue;
    out.push({ weight: w, reps });
  }
  return out;
}

export interface SetLike {
  weight: number;
  reps: number;
}

export function setVolume(sets: SetLike[]): number {
  return sets.reduce((s, x) => s + x.weight * x.reps, 0);
}

export function bestSet<T extends SetLike>(sets: T[]): T | null {
  let best: T | null = null;
  let bestE = 0;
  for (const s of sets) {
    const e = estimate1RM(s.weight, s.reps);
    if (e > bestE) {
      bestE = e;
      best = s;
    }
  }
  return best;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

export function formatDurationWords(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
