import { getDb, newId, notify, nowIso } from '../../core/db/database';

/* ---------------- health markers ---------------- */

export type MarkerKind = 'bp' | 'rhr' | 'hrv' | 'glucose' | 'steps' | 'sleep' | 'custom';

export interface MarkerDef {
  kind: Exclude<MarkerKind, 'custom'>;
  name: string;
  unit: string;
  /** Second value, e.g. diastolic pressure. */
  second?: string;
  hint: string;
  /** Returns a short note when the value is outside the usual range. */
  check?: (v: number, v2: number | null) => string | null;
}

export const MARKERS: MarkerDef[] = [
  {
    kind: 'bp',
    name: 'Blood pressure',
    unit: 'mmHg',
    second: 'Diastolic',
    hint: 'Seated, after 5 minutes of rest',
    check: (sys, dia) =>
      sys >= 140 || (dia ?? 0) >= 90 ? 'High. Recheck and talk to a doctor.' : sys >= 130 || (dia ?? 0) >= 80 ? 'Elevated' : sys < 90 ? 'Low' : null,
  },
  { kind: 'rhr', name: 'Resting heart rate', unit: 'bpm', hint: 'On waking, before getting up', check: (v) => (v > 100 ? 'High' : v < 40 ? 'Low' : null) },
  { kind: 'hrv', name: 'HRV', unit: 'ms', hint: 'From your watch or chest strap' },
  { kind: 'glucose', name: 'Fasting glucose', unit: 'mg/dL', hint: 'After at least 8 hours without food', check: (v) => (v >= 126 ? 'High. Talk to a doctor.' : v >= 100 ? 'Elevated' : v < 70 ? 'Low' : null) },
  { kind: 'steps', name: 'Steps', unit: 'steps', hint: 'Daily total from your phone or watch' },
  { kind: 'sleep', name: 'Sleep', unit: 'h', hint: 'Hours asleep last night' },
];

export const LAB_SUGGESTIONS: { label: string; unit: string }[] = [
  { label: 'Vitamin D', unit: 'ng/mL' },
  { label: 'HbA1c', unit: '%' },
  { label: 'Total cholesterol', unit: 'mg/dL' },
  { label: 'LDL', unit: 'mg/dL' },
  { label: 'HDL', unit: 'mg/dL' },
  { label: 'Triglycerides', unit: 'mg/dL' },
  { label: 'Testosterone', unit: 'ng/dL' },
  { label: 'Ferritin', unit: 'ng/mL' },
  { label: 'Vitamin B12', unit: 'pg/mL' },
  { label: 'TSH', unit: 'mIU/L' },
];

export interface Marker {
  id: string;
  dateKey: string;
  kind: MarkerKind;
  label: string | null;
  value: number;
  value2: number | null;
  unit: string | null;
}

interface MarkerRow {
  id: string;
  date_key: string;
  kind: MarkerKind;
  label: string | null;
  value: number;
  value2: number | null;
  unit: string | null;
}

const toMarker = (r: MarkerRow): Marker => ({ id: r.id, dateKey: r.date_key, kind: r.kind, label: r.label, value: r.value, value2: r.value2, unit: r.unit });

export const markerName = (m: Pick<Marker, 'kind' | 'label'>) => (m.kind === 'custom' ? (m.label ?? 'Lab result') : (MARKERS.find((d) => d.kind === m.kind)?.name ?? m.kind));

export function formatMarker(m: Pick<Marker, 'kind' | 'value' | 'value2' | 'unit'>): string {
  const n = (v: number) => (Number.isInteger(v) ? v.toLocaleString('en-US') : String(Math.round(v * 10) / 10));
  if (m.kind === 'bp') return `${n(m.value)}/${m.value2 != null ? n(m.value2) : '–'}`;
  return n(m.value);
}

export function addMarker(m: Omit<Marker, 'id'>) {
  const now = nowIso();
  getDb().runSync(
    'INSERT INTO health_markers (id, date_key, kind, label, value, value2, unit, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [newId(), m.dateKey, m.kind, m.label?.trim() || null, m.value, m.value2, m.unit, now, now],
  );
  notify('health_markers');
}

export function deleteMarker(id: string) {
  const now = nowIso();
  getDb().runSync('UPDATE health_markers SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
  notify('health_markers');
}

/** Newest entry for each marker (custom ones grouped by label), most recently logged first. */
export function latestMarkers(): (Marker & { previous: Marker | null; count: number })[] {
  const rows = getDb()
    .getAllSync<MarkerRow>('SELECT * FROM health_markers WHERE deleted_at IS NULL ORDER BY date_key DESC, created_at DESC')
    .map(toMarker);
  const groups = new Map<string, Marker[]>();
  for (const r of rows) {
    const key = r.kind === 'custom' ? `custom:${(r.label ?? '').toLowerCase()}` : r.kind;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.values()].map((list) => ({ ...list[0], previous: list[1] ?? null, count: list.length }));
}

export function markerHistory(kind: MarkerKind, label: string | null, limit = 60): Marker[] {
  const rows =
    kind === 'custom'
      ? getDb().getAllSync<MarkerRow>(
          "SELECT * FROM health_markers WHERE deleted_at IS NULL AND kind = 'custom' AND lower(label) = lower(?) ORDER BY date_key DESC, created_at DESC LIMIT ?",
          [label ?? '', limit],
        )
      : getDb().getAllSync<MarkerRow>('SELECT * FROM health_markers WHERE deleted_at IS NULL AND kind = ? ORDER BY date_key DESC, created_at DESC LIMIT ?', [kind, limit]);
  return rows.map(toMarker);
}

/* ---------------- supplements ---------------- */

export type SupplementTiming = 'morning' | 'pre' | 'post' | 'evening' | 'any';

export const TIMING_LABEL: Record<SupplementTiming, string> = {
  morning: 'Morning',
  pre: 'Pre-workout',
  post: 'Post-workout',
  evening: 'Evening',
  any: 'Any time',
};

export const SUPPLEMENT_SUGGESTIONS: { name: string; dose: string; timing: SupplementTiming }[] = [
  { name: 'Creatine', dose: '5 g', timing: 'any' },
  { name: 'Whey protein', dose: '1 scoop', timing: 'post' },
  { name: 'Vitamin D3', dose: '2,000 IU', timing: 'morning' },
  { name: 'Omega-3', dose: '1 g', timing: 'morning' },
  { name: 'Magnesium', dose: '200 mg', timing: 'evening' },
  { name: 'Caffeine', dose: '200 mg', timing: 'pre' },
  { name: 'Multivitamin', dose: '1 tablet', timing: 'morning' },
  { name: 'Electrolytes', dose: '1 serving', timing: 'pre' },
];

export interface Supplement {
  id: string;
  name: string;
  dose: string | null;
  timing: SupplementTiming;
}

export function listSupplements(): Supplement[] {
  return getDb()
    .getAllSync<{ id: string; name: string; dose: string | null; timing: SupplementTiming | null }>(
      'SELECT id, name, dose, timing FROM supplements WHERE deleted_at IS NULL ORDER BY position, created_at',
    )
    .map((r) => ({ ...r, timing: r.timing ?? 'any' }));
}

export function addSupplement(s: Omit<Supplement, 'id'>) {
  const now = nowIso();
  getDb().runSync('INSERT INTO supplements (id, name, dose, timing, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
    newId(),
    s.name.trim(),
    s.dose?.trim() || null,
    s.timing,
    listSupplements().length,
    now,
    now,
  ]);
  notify('supplements');
}

export function removeSupplement(id: string) {
  const now = nowIso();
  getDb().runSync('UPDATE supplements SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
  notify('supplements');
}

export function takenOn(day: string): Set<string> {
  const rows = getDb().getAllSync<{ supplement_id: string }>('SELECT supplement_id FROM supplement_logs WHERE date_key = ? AND deleted_at IS NULL', [day]);
  return new Set(rows.map((r) => r.supplement_id));
}

export function setTaken(supplementId: string, day: string, taken: boolean) {
  const db = getDb();
  const now = nowIso();
  if (taken) {
    db.runSync('INSERT INTO supplement_logs (id, supplement_id, date_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [newId(), supplementId, day, now, now]);
  } else {
    db.runSync('UPDATE supplement_logs SET deleted_at = ?, updated_at = ? WHERE supplement_id = ? AND date_key = ? AND deleted_at IS NULL', [now, now, supplementId, day]);
  }
  notify('supplement_logs');
}
