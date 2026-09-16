import { VOLUME_GROUPS } from './training';

/**
 * Rough per-muscle recovery. Each hard set adds fatigue that halves every `halfLifeHours`;
 * ten fresh sets on a muscle read as 0% recovered, roughly 50% a day and a bit later.
 */
export interface TrainedExercise {
  primary: string[];
  secondary: string[];
  sets: number;
  /** When the workout ended, in ms. */
  at: number;
}

export interface GroupRecovery {
  id: string;
  label: string;
  /** 0–100. */
  recovered: number;
  lastTrainedAt: number | null;
}

const FATIGUE_PER_SET = 10;
const LOOKBACK_MS = 7 * 86400_000;

export function muscleRecovery(entries: TrainedExercise[], now: number, halfLifeHours = 30): GroupRecovery[] {
  return VOLUME_GROUPS.map((g) => {
    let fatigue = 0;
    let last: number | null = null;
    for (const e of entries) {
      if (now - e.at > LOOKBACK_MS || e.at > now) continue;
      const weight = e.primary.some((m) => g.muscles.includes(m)) ? 1 : e.secondary.some((m) => g.muscles.includes(m)) ? 0.5 : 0;
      if (!weight) continue;
      const hours = (now - e.at) / 3600_000;
      fatigue += e.sets * weight * FATIGUE_PER_SET * 0.5 ** (hours / halfLifeHours);
      if (weight === 1) last = Math.max(last ?? 0, e.at);
    }
    return { id: g.id, label: g.label, recovered: Math.round(Math.max(0, 100 - fatigue)), lastTrainedAt: last };
  });
}
