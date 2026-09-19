import type { BindValue, Db } from './types';

/**
 * The web build runs SQLite in the browser with sql.js, loaded from /sqljs so the bundler never sees
 * its Node-only code. The database lives in memory and is saved to IndexedDB shortly after each
 * write and whenever the page is hidden. Unlike expo-sqlite's web engine, this needs no
 * cross-origin isolation headers, so it works in iPhone Safari and on GitHub Pages.
 */

interface Statement {
  bind(values: unknown[]): void;
  step(): boolean;
  getAsObject(): Record<string, unknown>;
  free(): void;
}

interface SqlJsDatabase {
  exec(sql: string): void;
  run(sql: string, params?: unknown[]): void;
  prepare(sql: string): Statement;
  export(): Uint8Array;
}

interface SqlJs {
  Database: new (data?: Uint8Array) => SqlJsDatabase;
}

declare global {
  interface Window {
    initSqlJs?: (config: { locateFile: (file: string) => string }) => Promise<SqlJs>;
  }
}

const BASE = `${process.env.EXPO_BASE_URL ?? ''}/sqljs`;
const IDB_NAME = 'metakai';
const IDB_STORE = 'files';
const IDB_KEY = 'metakai.db';
const SAVE_DELAY_MS = 400;

let database: SqlJsDatabase | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saving: Promise<void> = Promise.resolve();

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readSaved(): Promise<Uint8Array | null> {
  const store = (await idb()).transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE);
  return new Promise((resolve, reject) => {
    const req = store.get(IDB_KEY);
    req.onsuccess = () => resolve((req.result as Uint8Array | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function writeSaved(bytes: Uint8Array): Promise<void> {
  const tx = (await idb()).transaction(IDB_STORE, 'readwrite');
  tx.objectStore(IDB_STORE).put(bytes, IDB_KEY);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('Could not load the database engine.'));
    document.head.appendChild(el);
  });
}

function save(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  if (!database) return saving;
  // export() closes and reopens the connection, which resets per-connection pragmas.
  const bytes = database.export();
  database.exec('PRAGMA foreign_keys = ON;');
  saving = saving.then(() => writeSaved(bytes)).catch(() => {});
  return saving;
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(save, SAVE_DELAY_MS);
}

export async function prepareDb(): Promise<void> {
  if (database) return;
  if (!window.initSqlJs) await loadScript(`${BASE}/sql-wasm.js`);
  const SQL = await window.initSqlJs!({ locateFile: (file) => `${BASE}/${file}` });
  database = new SQL.Database((await readSaved().catch(() => null)) ?? undefined);
  // Ask the browser not to clear this site's storage under pressure.
  navigator.storage?.persist?.().catch(() => {});
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });
  window.addEventListener('pagehide', () => save());
}

export function flushDb(): Promise<void> {
  return save();
}

const bind = (params: BindValue[] = []) => params.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : (v ?? null)));

function query<T>(sql: string, params?: BindValue[], first = false): T[] {
  const stmt = database!.prepare(sql);
  try {
    stmt.bind(bind(params));
    const rows: T[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as T);
      if (first) break;
    }
    return rows;
  } finally {
    stmt.free();
  }
}

let depth = 0;

const web: Db = {
  execSync(sql) {
    database!.exec(sql);
    scheduleSave();
  },
  runSync(sql, params) {
    database!.run(sql, bind(params));
    scheduleSave();
    return undefined;
  },
  getAllSync<T>(sql: string, params?: BindValue[]) {
    return query<T>(sql, params);
  },
  getFirstSync<T>(sql: string, params?: BindValue[]) {
    return query<T>(sql, params, true)[0] ?? null;
  },
  withTransactionSync(task) {
    // Nested calls join the outer transaction.
    if (depth > 0) return task();
    depth++;
    database!.exec('BEGIN');
    try {
      task();
      database!.exec('COMMIT');
    } catch (e) {
      database!.exec('ROLLBACK');
      throw e;
    } finally {
      depth--;
    }
    scheduleSave();
  },
};

export function openDb(): Db {
  if (!database) throw new Error('The database is still loading.');
  return web;
}
