import { create } from 'zustand';

import { useAuth } from '../auth/auth';
import { supabase } from '../auth/supabase';
import { getDb, notify, SYNCED_TABLES, type TableName } from '../db/database';
import { getActivePhase, getProfile } from '../db/repo';
import { useSettings } from '../store/settings';

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

interface SyncState {
  status: SyncStatus;
  lastSyncedAt: string | null;
  error: string | null;
}

export const useSync = create<SyncState>(() => ({ status: 'idle', lastSyncedAt: null, error: null }));

const LOCAL_ONLY_COLUMNS = new Set(['synced_at']);
const columnCache = new Map<TableName, string[]>();

function columns(table: TableName): string[] {
  if (!columnCache.has(table)) {
    const info = getDb().getAllSync<{ name: string }>(`PRAGMA table_info(${table})`);
    columnCache.set(table, info.map((c) => c.name));
  }
  return columnCache.get(table)!;
}

type Row = Record<string, unknown>;

/** The server keeps one profile per user; adopt its id before pushing so devices converge. */
async function reconcileProfile(userId: string) {
  const db = getDb();
  const { data, error } = await supabase!.from('profile').select('id, updated_at').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  const local = db.getFirstSync<{ id: string; updated_at: string }>('SELECT id, updated_at FROM profile LIMIT 1');
  if (!data || !local || data.id === local.id) return;
  if (local.updated_at > data.updated_at) {
    db.runSync('UPDATE profile SET id = ?, synced_at = NULL WHERE id = ?', [data.id, local.id]);
  } else {
    db.runSync('DELETE FROM profile WHERE id = ?', [local.id]);
  }
}

async function push(table: TableName, userId: string) {
  const db = getDb();
  const rows = db.getAllSync<Row>(`SELECT * FROM ${table} WHERE synced_at IS NULL OR updated_at > synced_at LIMIT 500`);
  if (rows.length === 0) return;
  const payload = rows.map((r) => {
    const out: Row = {};
    for (const [k, v] of Object.entries(r)) if (!LOCAL_ONLY_COLUMNS.has(k)) out[k] = v;
    out.user_id = userId;
    return out;
  });
  const { error } = await supabase!.from(table).upsert(payload, { onConflict: 'id' });
  if (error) throw error;
  db.withTransactionSync(() => {
    for (const r of rows) {
      db.runSync(`UPDATE ${table} SET synced_at = ?, user_id = ? WHERE id = ? AND updated_at = ?`, [
        r.updated_at as string,
        userId,
        r.id as string,
        r.updated_at as string,
      ]);
    }
  });
  if (rows.length === 500) await push(table, userId);
}

async function pull(table: TableName) {
  const db = getDb();
  const state = db.getFirstSync<{ last_pulled_at: string | null }>('SELECT last_pulled_at FROM sync_state WHERE table_name = ?', [table]);
  let query = supabase!.from(table).select('*').order('updated_at', { ascending: true }).limit(1000);
  if (state?.last_pulled_at) query = query.gt('updated_at', state.last_pulled_at);
  const { data, error } = await query;
  if (error) throw error;
  if (!data || data.length === 0) return;

  const cols = columns(table);
  let changed = false;
  db.withTransactionSync(() => {
    for (const remote of data as Row[]) {
      const local = db.getFirstSync<{ updated_at: string }>(`SELECT updated_at FROM ${table} WHERE id = ?`, [remote.id as string]);
      if (local && local.updated_at >= (remote.updated_at as string)) continue;
      const keys = cols.filter((c) => c !== 'synced_at' && c in remote);
      const values = keys.map((k) => {
        const v = remote[k];
        return typeof v === 'object' && v !== null ? JSON.stringify(v) : (v as string | number | null);
      });
      db.runSync(
        `INSERT INTO ${table} (${keys.join(', ')}, synced_at) VALUES (${keys.map(() => '?').join(', ')}, ?)
         ON CONFLICT(id) DO UPDATE SET ${keys.map((k) => `${k} = excluded.${k}`).join(', ')}, synced_at = excluded.synced_at`,
        [...values, remote.updated_at as string],
      );
      changed = true;
    }
    const newest = (data[data.length - 1] as Row).updated_at as string;
    db.runSync(
      'INSERT INTO sync_state (table_name, last_pulled_at) VALUES (?, ?) ON CONFLICT(table_name) DO UPDATE SET last_pulled_at = excluded.last_pulled_at',
      [table, newest],
    );
  });
  if (changed) notify(table);
  if (data.length === 1000) await pull(table);
}

let running: Promise<void> | null = null;

/** Push local changes, then pull remote ones. Safe to call often; concurrent calls share one run. */
export function syncNow(): Promise<void> {
  const session = useAuth.getState().session;
  if (!supabase || !session) return Promise.resolve();
  if (running) return running;
  useSync.setState({ status: 'syncing', error: null });
  running = (async () => {
    try {
      await reconcileProfile(session.user.id);
      for (const table of SYNCED_TABLES) {
        await push(table, session.user.id);
        await pull(table);
      }
      useSync.setState({ status: 'idle', lastSyncedAt: new Date().toISOString() });
      // A returning user on a new device already has a plan in the cloud; skip onboarding.
      const settings = useSettings.getState();
      if (!settings.onboarded && getProfile() && getActivePhase()) settings.set({ onboarded: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const offline = /network|fetch/i.test(message);
      useSync.setState({ status: offline ? 'offline' : 'error', error: message });
    } finally {
      running = null;
    }
  })();
  return running;
}
