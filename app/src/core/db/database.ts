import { randomUUID } from 'expo-crypto';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import { MIGRATIONS } from './migrations';

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
  | 'saved_meals';

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
];

let db: SQLiteDatabase | null = null;

export function getDb(): SQLiteDatabase {
  if (!db) {
    db = openDatabaseSync('metakai.db');
    db.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    migrate(db);
  }
  return db;
}

function migrate(database: SQLiteDatabase) {
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
  notify(...SYNCED_TABLES);
}

/** Marks every row as unsynced so a later sign-in (possibly another account) uploads it all again. */
export function resetSyncState() {
  const database = getDb();
  database.withTransactionSync(() => {
    for (const t of SYNCED_TABLES) database.execSync(`UPDATE ${t} SET synced_at = NULL, user_id = NULL`);
    database.execSync('DELETE FROM sync_state');
  });
}
