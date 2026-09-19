import Storage from './kv';
import type { StateStorage } from 'zustand/middleware';

/** Synchronous SQLite-backed storage so persisted stores hydrate before first render. */
export const kvStorage: StateStorage = {
  getItem: (key) => Storage.getItemSync(key),
  setItem: (key, value) => Storage.setItemSync(key, value),
  removeItem: (key) => {
    Storage.removeItemSync(key);
  },
};
