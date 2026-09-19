import { randomUUID } from 'expo-crypto';
import { Directory, Paths } from 'expo-file-system';
import { openDb } from './engine';

import { MIGRATIONS } from './migrations';
import type { Db } from './types';

export type TableName =
  | 'profile'
  | 'phases'
  | 'weight_entries'
  | 'log_entries'
  | 'custom_foods'
  | 'water_entries'
  | 'custom_exercises'
  | 'routines'
  | 'routine_items'
  | 'workouts'
  | 'workout_exercises'
  | 'workout_sets'
  | 'measurements'
  | 'body_comp_entries'
  | 'progress_photos'
  | 'habits'
  | 'habit_logs'
  | 'saved_meals'
  | 'splits'
  | 'cardio_sessions'
  | 'recovery_checkins'
  | 'health_markers'
  | 'supplements'
  | 'supplement_logs'
  | 'achievements';

export const SYNCED_TABLES: TableName[] = [
  'profile',
  'phases',
  'weight_entries',
  'log_entries',
  'custom_foods',
  'water_entries',
  'custom_exercises',
  'routines',
  'routine_items',
  'workouts',
  'workout_exercises',
  'workout_sets',
  'measurements',
  'body_comp_entries',
  'progress_photos',
  'habits',
  'habit_logs',
  'saved_meals',
  'splits',
  'cardio_sessions',
  'recovery_checkins',
  'health_markers',
  'supplements',
  'supplement_logs',
  'achievements',
];

let db: Db | null = null;

export function getDb(): Db {
  if (!db) {
    db = openDb();
    db.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    migrate(db);
  }
  return db;
}

function migrate(database: Db) {
  const row = database.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  for (; version < MIGRATIONS.length; version++) {
    database.withTransactionSync(() => {
      database.execSync(MIGRATIONS[version]);
      database.execSync(`PRAGMA user_version = ${version + 1}`);
    });
  }
}

export const newId = () => randomUUID();
export const nowIso = () => new Date().toISOString();

type Listener = () => void;
const listeners = new Map<TableName, Set<Listener>>();

export function subscribe(tables: TableName[], listener: Listener): () => void {
  for (const t of tables) {
    if (!listeners.has(t)) listeners.set(t, new Set());
    listeners.get(t)!.add(listener);
  }
  return () => tables.forEach((t) => listeners.get(t)?.delete(listener));
}

export function notify(...tables: TableName[]) {
  const called = new Set<Listener>();
  for (const t of tables) {
    listeners.get(t)?.forEach((l) => {
      if (!called.has(l)) {
        called.add(l);
        l();
      }
    });
  }
}

/** Wipes all local user data (sign out with wipe, account deletion). */
export function clearAllData() {
  const database = getDb();
  database.withTransactionSync(() => {
    for (const t of SYNCED_TABLES) database.execSync(`DELETE FROM ${t}`);
    database.execSync('DELETE FROM sync_state');
  });
  try {
    const photos = new Directory(Paths.document, 'progress-photos');
    if (photos.exists) photos.delete();
  } catch {
    // Rows are gone; stray files are unreachable.
  }
  notify(...SYNCED_TABLES);
}

