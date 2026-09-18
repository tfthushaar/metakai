import { File, Directory, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { getDb, newId, notify, nowIso } from '../../core/db/database';

export const MEASUREMENT_SITES = [
  { id: 'waist', label: 'Waist', hint: 'At the navel, relaxed' },
  { id: 'neck', label: 'Neck', hint: 'Just below the larynx' },
  { id: 'chest', label: 'Chest', hint: 'Across the nipples' },
  { id: 'shoulders', label: 'Shoulders', hint: 'Widest point' },
  { id: 'hips', label: 'Hips', hint: 'Widest point of the glutes' },
  { id: 'arm_left', label: 'Arm (L)', hint: 'Flexed, at the peak' },
  { id: 'arm_right', label: 'Arm (R)', hint: 'Flexed, at the peak' },
  { id: 'thigh_left', label: 'Thigh (L)', hint: 'Midway hip to knee' },
  { id: 'thigh_right', label: 'Thigh (R)', hint: 'Midway hip to knee' },
  { id: 'calf_left', label: 'Calf (L)', hint: 'Widest point' },
  { id: 'calf_right', label: 'Calf (R)', hint: 'Widest point' },
] as const;

export type MeasurementSite = (typeof MEASUREMENT_SITES)[number]['id'];

export interface Measurement {
  id: string;
  dateKey: string;
  site: MeasurementSite;
  cm: number;
}

export type BodyFatMethod = 'navy' | 'jp3' | 'jp7' | 'scale' | 'dexa' | 'visual';

export const METHOD_LABEL: Record<BodyFatMethod, string> = {
  navy: 'Tape (US Navy)',
  jp3: 'Calipers, 3 sites',
  jp7: 'Calipers, 7 sites',
  scale: 'Smart scale',
  dexa: 'DEXA / scan',
  visual: 'Visual estimate',
};

export interface BodyCompEntry {
  id: string;
  dateKey: string;
  method: BodyFatMethod;
  bfPct: number;
  data: Record<string, number>;
}

export type Pose = 'front' | 'side' | 'back';

export interface ProgressPhoto {
  id: string;
  dateKey: string;
  pose: Pose;
  localPath: string | null;
  weightKg: number | null;
  note: string | null;
  createdAt: string;
}

/* ---------------- measurements ---------------- */

export function listMeasurements(site?: MeasurementSite): Measurement[] {
  const rows = getDb().getAllSync<{ id: string; date_key: string; site: MeasurementSite; cm: number }>(
    site
      ? 'SELECT id, date_key, site, cm FROM measurements WHERE deleted_at IS NULL AND site = ? ORDER BY date_key, created_at'
      : 'SELECT id, date_key, site, cm FROM measurements WHERE deleted_at IS NULL ORDER BY date_key, created_at',
    site ? [site] : [],
  );
  return rows.map((r) => ({ id: r.id, dateKey: r.date_key, site: r.site, cm: r.cm }));
}

/** Latest value per site. */
export function latestMeasurements(): Partial<Record<MeasurementSite, Measurement>> {
  const out: Partial<Record<MeasurementSite, Measurement>> = {};
  for (const m of listMeasurements()) out[m.site] = m;
  return out;
}

/** Saves a set of measurements for a day, replacing that day's earlier values for the same sites. */
export function saveMeasurements(dateKey: string, values: Partial<Record<MeasurementSite, number>>) {
  const db = getDb();
  const now = nowIso();
  db.withTransactionSync(() => {
    for (const [site, cm] of Object.entries(values)) {
      if (cm == null || !(cm > 0)) continue;
      db.runSync('UPDATE measurements SET deleted_at = ?, updated_at = ? WHERE date_key = ? AND site = ? AND deleted_at IS NULL', [now, now, dateKey, site]);
      db.runSync('INSERT INTO measurements (id, date_key, site, cm, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [newId(), dateKey, site, cm, now, now]);
    }
  });
  notify('measurements');
}

/* ---------------- body composition ---------------- */

export function listBodyComp(): BodyCompEntry[] {
  return getDb()
    .getAllSync<{ id: string; date_key: string; method: BodyFatMethod; bf_pct: number; data: string }>(
      'SELECT id, date_key, method, bf_pct, data FROM body_comp_entries WHERE deleted_at IS NULL ORDER BY date_key, created_at',
    )
    .map((r) => ({ id: r.id, dateKey: r.date_key, method: r.method, bfPct: r.bf_pct, data: JSON.parse(r.data) }));
}

export function addBodyComp(dateKey: string, method: BodyFatMethod, bfPct: number, data: Record<string, number> = {}) {
  const now = nowIso();
  getDb().runSync('INSERT INTO body_comp_entries (id, date_key, method, bf_pct, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
    newId(),
    dateKey,
    method,
    Math.round(bfPct * 10) / 10,
    JSON.stringify(data),
    now,
    now,
  ]);
  notify('body_comp_entries');
}

export function deleteMeasurement(id: string) {
  const now = nowIso();
  getDb().runSync('UPDATE measurements SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
  notify('measurements');
}

export function deleteBodyComp(id: string) {
  const now = nowIso();
  getDb().runSync('UPDATE body_comp_entries SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
  notify('body_comp_entries');
}

/* ---------------- photos ---------------- */

const photoDir = () => {
  const dir = new Directory(Paths.document, 'progress-photos');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
};

export function listPhotos(): ProgressPhoto[] {
  return getDb()
    .getAllSync<{ id: string; date_key: string; pose: Pose; local_path: string | null; weight_kg: number | null; note: string | null; created_at: string }>(
      'SELECT * FROM progress_photos WHERE deleted_at IS NULL ORDER BY date_key DESC, created_at DESC',
    )
    .map((r) => ({ id: r.id, dateKey: r.date_key, pose: r.pose, localPath: r.local_path, weightKg: r.weight_kg, note: r.note, createdAt: r.created_at }));
}

/** Resized, compressed copy stored in app-private storage (never the gallery). */
export async function savePhoto(sourceUri: string, dateKey: string, pose: Pose, weightKg: number | null): Promise<ProgressPhoto> {
  const id = newId();
  const rendered = await ImageManipulator.manipulate(sourceUri).resize({ width: 1080 }).renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  const dest = new File(photoDir(), `${id}.jpg`);
  await new File(saved.uri).move(dest);
  const now = nowIso();
  getDb().runSync(
    'INSERT INTO progress_photos (id, date_key, pose, local_path, weight_kg, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, dateKey, pose, dest.uri, weightKg, now, now],
  );
  notify('progress_photos');
  return { id, dateKey, pose, localPath: dest.uri, weightKg, note: null, createdAt: now };
}

export function deletePhoto(photo: ProgressPhoto) {
  const now = nowIso();
  getDb().runSync('UPDATE progress_photos SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, photo.id]);
  try {
    if (photo.localPath) {
      const file = new File(photo.localPath);
      if (file.exists) file.delete();
    }
  } catch {
    // The row is gone either way; a leftover file is harmless.
  }
  notify('progress_photos');
}

export function photoAvailable(photo: ProgressPhoto): boolean {
  if (!photo.localPath) return false;
  try {
    return new File(photo.localPath).exists;
  } catch {
    return false;
  }
}
