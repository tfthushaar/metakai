import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { dateKey } from '../lib/dates';
import { getDb, notify, SYNCED_TABLES, type TableName } from './db/database';
import { useSettings } from './store/settings';

/**
 * A backup is one JSON file: every synced table, the app settings and (optionally) progress photos.
 * Restoring merges by row id; the newer copy of a row wins, except the profile and active phase,
 * which the backup always provides.
 */
const FORMAT = 1;
const APP = 'metakai';

type Row = Record<string, string | number | null>;

interface Backup {
  app: typeof APP;
  format: number;
  schema: number;
  exportedAt: string;
  settings: Record<string, unknown>;
  tables: Partial<Record<TableName, Row[]>>;
  photos?: Record<string, string>;
}

/** Settings that belong to this phone rather than to the user's data. */
const DEVICE_SETTINGS = ['authMode', 'onboarded', 'appLock', 'drive', 'leaderboard', 'watch'];

const schemaVersion = () => getDb().getFirstSync<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0;

function settingsSnapshot(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(useSettings.getState())) {
    if (typeof v !== 'function' && !DEVICE_SETTINGS.includes(k)) out[k] = v;
  }
  return out;
}

function snapshotTables(): { tables: Partial<Record<TableName, Row[]>>; records: number } {
  const tables: Partial<Record<TableName, Row[]>> = {};
  let records = 0;
  for (const t of SYNCED_TABLES) {
    const rows = getDb()
      .getAllSync<Row>(`SELECT * FROM ${t}`)
      .map(({ synced_at: _s, user_id: _u, ...rest }) => rest as Row);
    tables[t] = rows;
    records += rows.filter((r) => r.deleted_at == null).length;
  }
  return { tables, records };
}

/** The whole database and settings as JSON, without photo files. */
export function snapshotJson(): string {
  const { tables } = snapshotTables();
  const data: Backup = { app: APP, format: FORMAT, schema: schemaVersion(), exportedAt: new Date().toISOString(), settings: settingsSnapshot(), tables };
  return JSON.stringify(data);
}

export const photoDirectory = () => {
  const dir = new Directory(Paths.document, 'progress-photos');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
};

export interface BackupSummary {
  records: number;
  photos: number;
}

/** Writes a backup file to the cache and opens the share sheet so the user can save it anywhere. */
export async function exportBackup(includePhotos: boolean): Promise<BackupSummary> {
  const dir = new Directory(Paths.cache, 'backups');
  if (!dir.exists) dir.create({ intermediates: true });
  const file = new File(dir, `metakai-backup-${dateKey()}.json`);
  if (file.exists) file.delete();
  file.create();

  const { tables, records } = snapshotTables();
  const head: Omit<Backup, 'photos'> = { app: APP, format: FORMAT, schema: schemaVersion(), exportedAt: new Date().toISOString(), settings: settingsSnapshot(), tables };
  // Photos are streamed one at a time so a large library never sits in memory as one string.
  const json = JSON.stringify(head);
  file.write(json.slice(0, -1) + ',"photos":{');
  let photos = 0;
  if (includePhotos) {
    for (const p of tables.progress_photos ?? []) {
      if (p.deleted_at != null || typeof p.local_path !== 'string') continue;
      const src = new File(p.local_path);
      if (!src.exists) continue;
      file.write(`${photos ? ',' : ''}${JSON.stringify(p.id)}:${JSON.stringify(await src.base64())}`, { append: true });
      photos++;
    }
  }
  file.write('}}', { append: true });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save Metakai backup', UTI: 'public.json' });
  }
  return { records, photos };
}

const columnsOf = (t: TableName) => getDb().getAllSync<{ name: string }>(`PRAGMA table_info(${t})`).map((c) => c.name);

function parse(text: string): Backup {
  let data: Backup;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not a Metakai backup.');
  }
  if (data?.app !== APP || typeof data.tables !== 'object') throw new Error('This file is not a Metakai backup.');
  if (data.format > FORMAT || data.schema > schemaVersion()) throw new Error('This backup is from a newer version of Metakai. Update the app first.');
  return data;
}

/** Opens the file picker and restores the chosen backup. Returns null if the user cancelled. */
export async function pickAndRestoreBackup(): Promise<BackupSummary | null> {
  const picked = await File.pickFileAsync({ mimeTypes: ['application/json', 'application/octet-stream', 'text/plain', '*/*'] });
  if (picked.canceled) return null;
  return restoreBackup(await picked.result.text());
}

/**
 * Merges a backup into this phone. `applySettings` is for a user-initiated restore; background sync
 * leaves this phone's settings alone.
 */
export async function restoreBackup(text: string, { applySettings = true } = {}): Promise<BackupSummary> {
  const data = parse(text);
  const db = getDb();
  const photoDir = photoDirectory();

  // Write photo files first so rows can point at them.
  const photoPaths = new Map<string, string>();
  for (const [id, b64] of Object.entries(data.photos ?? {})) {
    if (!/^[\w-]+$/.test(id)) continue;
    const dest = new File(photoDir, `${id}.jpg`);
    if (!dest.exists) {
      dest.create();
      dest.write(b64, { encoding: 'base64' });
    }
    photoPaths.set(id, dest.uri);
  }

  let records = 0;
  const touched: TableName[] = [];
  db.withTransactionSync(() => {
    for (const table of SYNCED_TABLES) {
      const rows = data.tables[table];
      if (!rows?.length) continue;
      const cols = columnsOf(table).filter((c) => c !== 'synced_at' && c !== 'user_id');
      if (applySettings && table === 'profile' && rows.some((r) => r.deleted_at == null)) db.runSync('DELETE FROM profile');
      if (applySettings && table === 'phases' && rows.some((r) => r.status === 'active' && r.deleted_at == null)) {
        const ids = rows.map((r) => r.id);
        db.runSync(
          `UPDATE phases SET status = 'completed', end_date = COALESCE(end_date, ?), updated_at = ?
           WHERE status = 'active' AND id NOT IN (${ids.map(() => '?').join(',')})`,
          [dateKey(), new Date().toISOString(), ...(ids as string[])],
        );
      }

      for (const row of rows) {
        if (typeof row.id !== 'string' || typeof row.updated_at !== 'string') continue;
        const local = db.getFirstSync<{ updated_at: string }>(`SELECT updated_at FROM ${table} WHERE id = ?`, [row.id]);
        if (local && local.updated_at >= row.updated_at) continue;
        const r = { ...row };
        if (table === 'progress_photos') {
          // File paths belong to this phone: keep ours unless the backup brought the file.
          const mine = local ? db.getFirstSync<{ local_path: string | null }>('SELECT local_path FROM progress_photos WHERE id = ?', [row.id])?.local_path : null;
          r.local_path = photoPaths.get(row.id) ?? mine ?? null;
        }
        const keys = cols.filter((c) => c in r);
        db.runSync(
          `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})
           ON CONFLICT(id) DO UPDATE SET ${keys.map((k) => `${k} = excluded.${k}`).join(', ')}, synced_at = NULL`,
          keys.map((k) => r[k] ?? null),
        );
        if (row.deleted_at == null) records++;
      }
      touched.push(table);
    }

    // Two phones merged: keep one profile and one active goal, the most recently edited.
    const profiles = db.getAllSync<{ id: string }>('SELECT id FROM profile WHERE deleted_at IS NULL ORDER BY updated_at DESC');
    for (const p of profiles.slice(1)) db.runSync('DELETE FROM profile WHERE id = ?', [p.id]);
    const active = db.getAllSync<{ id: string }>("SELECT id FROM phases WHERE status = 'active' AND deleted_at IS NULL ORDER BY updated_at DESC");
    const now = new Date().toISOString();
    for (const p of active.slice(1)) {
      db.runSync("UPDATE phases SET status = 'completed', end_date = COALESCE(end_date, ?), updated_at = ? WHERE id = ?", [dateKey(), now, p.id]);
    }
  });

  if (applySettings) {
    const restored: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data.settings ?? {})) if (!DEVICE_SETTINGS.includes(k)) restored[k] = v;
    useSettings.getState().set(restored as never);
  }
  if (touched.length) notify(...touched);
  return { records, photos: photoPaths.size };
}
