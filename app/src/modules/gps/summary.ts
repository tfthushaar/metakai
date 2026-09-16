import { cardioCalories } from '../../lib/cardio';
import { dateKey } from '../../lib/dates';
import { BEST_EFFORTS, bestEffort, encodePolyline, simplify, splits, trackStats, type GeoPoint, type TrackKind } from '../../lib/geo';
import { addCardio, type RouteSplits } from '../cardio/repo';

export const MI = 1609.344;

export const TRACK_KINDS: { id: TrackKind; label: string }[] = [
  { id: 'run', label: 'Run' },
  { id: 'walk', label: 'Walk' },
  { id: 'hike', label: 'Hike' },
  { id: 'cycle', label: 'Ride' },
];

export const trackLabel = (kind: TrackKind) => TRACK_KINDS.find((k) => k.id === kind)?.label ?? 'Activity';

/** "Morning run", "Evening ride". */
export function defaultTitle(kind: TrackKind, at = new Date()): string {
  const h = at.getHours();
  const part = h < 5 ? 'Night' : h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : h < 21 ? 'Evening' : 'Night';
  return `${part} ${trackLabel(kind).toLowerCase()}`;
}

/** Best efforts are tracked for runs only, like most running apps. */
export const hasBestEfforts = (kind: TrackKind) => kind === 'run';

export interface Summary {
  kind: TrackKind;
  distanceM: number;
  movingSec: number;
  elapsedSec: number;
  elevationGainM: number;
  kcal: number;
  route: string;
  points: [number, number][];
  splits: RouteSplits;
}

export function summarize(segments: GeoPoint[][], kind: TrackKind, elapsedSec: number, metric: boolean, bodyweightKg: number): Summary {
  const stats = trackStats(segments, kind);
  const unitM = metric ? 1000 : MI;
  const all = segments.flat();
  const simple = simplify(all, 3).map((p) => [p.lat, p.lon] as [number, number]);
  const best: Record<string, number> = {};
  if (hasBestEfforts(kind)) {
    for (const e of BEST_EFFORTS) {
      const t = bestEffort(segments, kind, e.meters);
      if (t != null) best[e.id] = Math.round(t);
    }
  }
  return {
    kind,
    distanceM: stats.distanceM,
    movingSec: stats.movingSec,
    elapsedSec,
    elevationGainM: stats.elevationGainM,
    kcal: cardioCalories({ kind, durationMin: stats.movingSec / 60, distanceKm: stats.distanceM / 1000, bodyweightKg }),
    route: encodePolyline(simple),
    points: simple,
    splits: {
      unitM,
      splits: splits(segments, kind, unitM).map((s) => ({ d: Math.round(s.distanceM), t: Math.round(s.movingSec), e: s.elevationDeltaM })),
      best,
    },
  };
}

export function saveSummary(s: Summary, title: string, startedAt: number): string {
  return addCardio({
    dateKey: dateKey(new Date(startedAt)),
    kind: s.kind,
    durationMin: Math.round((s.movingSec / 60) * 10) / 10,
    distanceKm: Math.round(s.distanceM) / 1000,
    avgHr: null,
    rpe: null,
    kcal: s.kcal,
    intervals: null,
    note: null,
    route: s.route,
    elevationM: s.elevationGainM,
    elapsedMin: Math.round((s.elapsedSec / 60) * 10) / 10,
    splits: s.splits,
    title: title.trim() || null,
  });
}
