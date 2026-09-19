import { openDatabaseSync } from 'expo-sqlite';

import type { Db } from './types';

/** On phones the database opens synchronously; the web build loads its engine first (engine.web.ts). */
export async function prepareDb(): Promise<void> {}

export function openDb(): Db {
  return openDatabaseSync('metakai.db') as unknown as Db;
}

/** Web only: writes pending changes to browser storage. */
export async function flushDb(): Promise<void> {}
