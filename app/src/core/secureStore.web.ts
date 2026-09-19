/**
 * Browsers have no keychain, so the web build keeps these values (AI keys, leaderboard session) in
 * this site's localStorage, which only pages from this origin can read.
 */
const PREFIX = 'metakai.secure.';

export function getItem(key: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export async function getItemAsync(key: string): Promise<string | null> {
  return getItem(key);
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  window.localStorage.setItem(PREFIX + key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  window.localStorage.removeItem(PREFIX + key);
}
