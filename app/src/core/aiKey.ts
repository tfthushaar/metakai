import * as SecureStore from './secureStore';
import { create } from 'zustand';

/** The user's own AI API keys, kept in the OS keystore and never included in backups. */
export type AiProvider = 'gemini' | 'groq';

const storeKey = (p: AiProvider) => `metakai.${p}Key`;

export const useAiKeys = create<Record<AiProvider, string | null>>(() => ({
  gemini: SecureStore.getItem(storeKey('gemini')),
  groq: SecureStore.getItem(storeKey('groq')),
}));

export const hasAiKey = (keys = useAiKeys.getState()) => keys.gemini != null || keys.groq != null;

export async function setAiKey(provider: AiProvider, key: string | null) {
  const value = key?.trim() || null;
  if (value) await SecureStore.setItemAsync(storeKey(provider), value);
  else await SecureStore.deleteItemAsync(storeKey(provider));
  useAiKeys.setState({ [provider]: value });
}

/** A cheap call that fails fast on a bad key. */
export async function testAiKey(provider: AiProvider, key: string): Promise<void> {
  const res =
    provider === 'gemini'
      ? await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { headers: { 'x-goog-api-key': key.trim() } })
      : await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${key.trim()}` } });
  if (res.status === 400 || res.status === 401 || res.status === 403) throw new Error('That key was rejected.');
  if (!res.ok) throw new Error(`The provider returned ${res.status}. Try again shortly.`);
}
