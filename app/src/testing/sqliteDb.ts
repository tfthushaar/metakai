/**
 * A real SQLite for tests: the sql.js build the web app ships, with every migration applied.
 * Use it in place of the app database:
 *
 *   jest.mock('../../../core/db/database', () => require('../../../testing/sqliteDb').database);
 *   beforeAll(() => openTestDb());
 */
import { MIGRATIONS } from '../core/db/migrations';

type Row = Record<string, unknown>;
interface SqlDb {
  exec(sql: string): void;
  run(sql: string, params?: unknown[]): void;
  prepare(sql: string): { bind(v: unknown[]): void; step(): boolean; getAsObject(): Row; free(): void };
}

let sql: SqlDb | null = null;

const all = (q: string, params: unknown[] = []) => {
  const st = sql!.prepare(q);
  st.bind(params);
  const out: Row[] = [];
  while (st.step()) out.push(st.getAsObject());
  st.free();
  return out;
};

export const testDb = {
  execSync: (q: string) => sql!.exec(q),
  runSync: (q: string, params: unknown[] = []) => sql!.run(q, params),
  getAllSync: (q: string, params: unknown[] = []) => all(q, params),
  getFirstSync: (q: string, params: unknown[] = []) => all(q, params)[0] ?? null,
  withTransactionSync: (fn: () => void) => fn(),
};

let n = 0;
export const database = {
  getDb: () => testDb,
  newId: () => `id-${++n}`,
  notify: () => {},
  subscribe: () => () => {},
  nowIso: () => new Date().toISOString(),
};

export async function openTestDb() {
  // In Node, sql.js finds its .wasm next to the script.
  const SQL = await require('../../public/sqljs/sql-wasm.js')();
  sql = new SQL.Database() as SqlDb;
  for (const m of MIGRATIONS) sql.exec(m);
}
