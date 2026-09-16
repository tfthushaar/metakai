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
});

export type NewCardio = Omit<CardioSession, 'id' | 'createdAt'>;

export function addCardio(s: NewCardio): string {
  const id = newId();
  const now = nowIso();
  getDb().runSync(
    `INSERT INTO cardio_sessions (id, date_key, kind, duration_min, distance_km, avg_hr, rpe, kcal, intervals, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, s.dateKey, s.kind, s.durationMin, s.distanceKm, s.avgHr, s.rpe, s.kcal, s.intervals ? JSON.stringify(s.intervals) : null, s.note, now, now],
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
