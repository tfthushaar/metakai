/**
 * Cardio energy estimates from the Compendium of Physical Activities (2024).
 * With a distance, walking, running and cycling use speed; otherwise effort (RPE 1–10) picks a MET band.
 */
export type CardioKind = 'walk' | 'run' | 'hike' | 'cycle' | 'row' | 'swim' | 'elliptical' | 'stairs' | 'hiit' | 'sport' | 'other';

export const CARDIO_KINDS: { id: CardioKind; label: string; distance: boolean }[] = [
  { id: 'walk', label: 'Walk', distance: true },
  { id: 'run', label: 'Run', distance: true },
  { id: 'hike', label: 'Hike', distance: true },
  { id: 'cycle', label: 'Cycle', distance: true },
  { id: 'row', label: 'Row', distance: true },
  { id: 'swim', label: 'Swim', distance: true },
  { id: 'elliptical', label: 'Elliptical', distance: false },
  { id: 'stairs', label: 'Stairs', distance: false },
  { id: 'hiit', label: 'HIIT', distance: false },
  { id: 'sport', label: 'Sport', distance: false },
  { id: 'other', label: 'Other', distance: false },
];

export const cardioLabel = (kind: CardioKind) => CARDIO_KINDS.find((k) => k.id === kind)?.label ?? 'Cardio';

/** MET for light (RPE ≤ 4), moderate (5–6), hard (7–8) and max (9–10) effort. */
const MET_BY_EFFORT: Record<CardioKind, [number, number, number, number]> = {
  walk: [2.8, 3.5, 4.5, 5.5],
  run: [7.0, 9.0, 11.0, 12.8],
  hike: [5.3, 6.0, 7.3, 8.5],
  cycle: [4.0, 6.8, 8.5, 11.0],
  row: [4.8, 7.0, 8.5, 12.0],
  swim: [5.8, 7.0, 9.8, 10.3],
  elliptical: [4.6, 5.0, 6.5, 8.0],
  stairs: [4.0, 6.5, 8.8, 10.0],
  hiit: [6.0, 8.0, 9.5, 11.0],
  sport: [4.0, 6.0, 8.0, 10.0],
  other: [3.0, 5.0, 7.0, 9.0],
};

/** [km/h, MET] points, interpolated linearly and clamped at the ends. */
const MET_BY_SPEED: Partial<Record<CardioKind, [number, number][]>> = {
  walk: [
    [3.2, 2.8],
    [4.0, 3.0],
    [4.8, 3.5],
    [5.6, 4.3],
    [6.4, 5.0],
    [7.2, 7.0],
  ],
  run: [
    [6.4, 6.0],
    [8.0, 8.3],
    [9.7, 9.8],
    [11.3, 11.0],
    [12.9, 11.8],
    [14.5, 12.8],
    [16.1, 14.5],
    [17.7, 16.0],
    [19.3, 19.0],
  ],
  cycle: [
    [16, 4.0],
    [19, 6.8],
    [22, 8.0],
    [25.5, 10.0],
    [30, 12.0],
    [32, 15.8],
  ],
};

function interpolate(points: [number, number][], x: number): number {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (x <= x1) {
      const [x0, y0] = points[i - 1];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return points[points.length - 1][1];
}

export interface CardioInput {
  kind: CardioKind;
  durationMin: number;
  distanceKm?: number | null;
  /** Rate of perceived exertion, 1–10. */
  rpe?: number | null;
}

export function cardioMet({ kind, durationMin, distanceKm, rpe }: CardioInput): number {
  const table = MET_BY_SPEED[kind];
  if (table && distanceKm && distanceKm > 0 && durationMin > 0) {
    return interpolate(table, distanceKm / (durationMin / 60));
  }
  const bands = MET_BY_EFFORT[kind];
  const effort = rpe ?? 6;
  return effort <= 4 ? bands[0] : effort <= 6 ? bands[1] : effort <= 8 ? bands[2] : bands[3];
}

export function cardioCalories(input: CardioInput & { bodyweightKg: number }): number {
  if (input.bodyweightKg <= 0 || input.durationMin <= 0) return 0;
  return Math.round(cardioMet(input) * input.bodyweightKg * (input.durationMin / 60));
}

/** Minutes per km, or null without a distance. */
export function paceMinPerKm(durationMin: number, distanceKm: number | null | undefined): number | null {
  return distanceKm && distanceKm > 0 && durationMin > 0 ? durationMin / distanceKm : null;
}

/** "5:32" for 5.53 minutes. */
export function formatPace(minutes: number): string {
  let m = Math.floor(minutes);
  let s = Math.round((minutes - m) * 60);
  if (s === 60) {
    m += 1;
    s = 0;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}
