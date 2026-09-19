/** localStorage with the same synchronous calls the app uses from expo-sqlite/kv-store. */
const Storage = {
  getItemSync(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItemSync(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Storage full or blocked; the value only lives for this session.
    }
  },
  removeItemSync(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // As above.
    }
  },
};

export default Storage;
