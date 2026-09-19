import { getDb, newId, notify, nowIso } from '../../core/db/database';
import type { CardioKind } from '../../lib/cardio';
import type { IntervalConfig } from '../../lib/intervals';

export interface CardioSession {
  id: string;
  dateKey: string;
  kind: CardioKind;
  durationMin: number;
  distanceKm: number | null;
  avgHr: number | null;
  rpe: number | null;
  kcal: number | null;
  intervals: (IntervalConfig & { name: string }) | null;
  note: string | null;
  createdAt: string;
  /** Encoded polyline for GPS-recorded sessions. */
  route: string | null;
  elevationM: number | null;
  elapsedMin: number | null;
  splits: RouteSplits | null;
  title: string | null;
}

/** Splits and best efforts saved with a GPS session. Times are moving seconds. */
export interface RouteSplits {
  unitM: number;
  splits: { d: number; t: number; e: number | null }[];
  best: Record<string, number>;
}

interface Row {
  id: string;
  date_key: string;
  kind: CardioKind;
  duration_min: number;
  distance_km: number | null;
  avg_hr: number | null;
  rpe: number | null;
  kcal: number | null;
  intervals: string | null;
  note: string | null;
  created_at: string;
  route: string | null;
  elevation_m: number | null;
  elapsed_min: number | null;
  splits: string | null;
  title: string | null;
}

const toSession = (r: Row): CardioSession => ({
  id: r.id,
  dateKey: r.date_key,
  kind: r.kind,
  durationMin: r.duration_min,
  distanceKm: r.distance_km,
  avgHr: r.avg_hr,
  rpe: r.rpe,
  kcal: r.kcal,
  intervals: r.intervals ? JSON.parse(r.intervals) : null,
  note: r.note,
  createdAt: r.created_at,
  route: r.route,
  elevationM: r.elevation_m,
  elapsedMin: r.elapsed_min,
  splits: r.splits ? JSON.parse(r.splits) : null,
  title: r.title,
});

export type NewCardio = Omit<CardioSession, 'id' | 'createdAt' | 'route' | 'elevationM' | 'elapsedMin' | 'splits' | 'title'> &
  Partial<Pick<CardioSession, 'route' | 'elevationM' | 'elapsedMin' | 'splits' | 'title'>> & {
    /** When a recording began, so a watch recording of the same session can be matched to it. */
    startedAt?: string | null;
  };

export function addCardio(s: NewCardio): string {
  const id = newId();
  const now = nowIso();
  getDb().runSync(
    `INSERT INTO cardio_sessions (id, date_key, kind, duration_min, distance_km, avg_hr, rpe, kcal, intervals, note, route, elevation_m, elapsed_min, splits, title, started_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      s.dateKey,
      s.kind,
      s.durationMin,
      s.distanceKm,
      s.avgHr,
      s.rpe,
      s.kcal,
      s.intervals ? JSON.stringify(s.intervals) : null,
      s.note,
      s.route ?? null,
      s.elevationM ?? null,
      s.elapsedMin ?? null,
      s.splits ? JSON.stringify(s.splits) : null,
      s.title ?? null,
      s.startedAt ?? null,
      now,
      now,
    ],
  );
  notify('cardio_sessions');
  return id;
}

export function deleteCardio(id: string) {
  const now = nowIso();
  getDb().runSync('UPDATE cardio_sessions SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
  notify('cardio_sessions');
}

export function listCardio(limit = 20): CardioSession[] {
  return getDb()
    .getAllSync<Row>('SELECT * FROM cardio_sessions WHERE deleted_at IS NULL ORDER BY date_key DESC, created_at DESC LIMIT ?', [limit])
    .map(toSession);
}

export interface CardioStats {
  sessions: number;
  minutes: number;
  kcal: number;
  distanceKm: number;
}

export function cardioStats(fromDateKey: string, toDateKey = '9999'): CardioStats {
  const r = getDb().getFirstSync<{ n: number; minutes: number | null; kcal: number | null; km: number | null }>(
    `SELECT COUNT(*) AS n, SUM(duration_min) AS minutes, SUM(kcal) AS kcal, SUM(distance_km) AS km
     FROM cardio_sessions WHERE deleted_at IS NULL AND date_key >= ? AND date_key <= ?`,
    [fromDateKey, toDateKey],
  );
  return { sessions: r?.n ?? 0, minutes: Math.round(r?.minutes ?? 0), kcal: Math.round(r?.kcal ?? 0), distanceKm: r?.km ?? 0 };
}

export function getCardio(id: string): CardioSession | null {
  const r = getDb().getFirstSync<Row>('SELECT * FROM cardio_sessions WHERE id = ? AND deleted_at IS NULL', [id]);
  return r ? toSession(r) : null;
}

export function renameCardio(id: string, title: string) {
  getDb().runSync('UPDATE cardio_sessions SET title = ?, updated_at = ? WHERE id = ?', [title.trim() || null, nowIso(), id]);
  notify('cardio_sessions');
}

/** Fastest saved time for each best-effort distance, excluding one session. */
export function bestEfforts(kind: CardioKind, excludeId: string | null = null): Record<string, number> {
  const rows = getDb().getAllSync<{ id: string; splits: string }>(
    'SELECT id, splits FROM cardio_sessions WHERE deleted_at IS NULL AND kind = ? AND splits IS NOT NULL',
    [kind],
  );
  const best: Record<string, number> = {};
  for (const r of rows) {
    if (r.id === excludeId) continue;
    try {
      const parsed = JSON.parse(r.splits) as RouteSplits;
      for (const [k, v] of Object.entries(parsed.best ?? {})) if (best[k] == null || v < best[k]) best[k] = v;
    } catch {
      // Ignore malformed rows.
    }
  }
  return best;
}
