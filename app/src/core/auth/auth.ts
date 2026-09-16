import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { AppState } from 'react-native';
import { create } from 'zustand';

import { useSettings } from '../store/settings';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

interface AuthState {
  session: Session | null;
  initialized: boolean;
}

export const useAuth = create<AuthState>(() => ({ session: null, initialized: false }));

export const redirectUrl = () => Linking.createURL('auth-callback');

let started = false;

export function startAuth() {
  if (started) return;
  started = true;
  if (!supabase) {
    useAuth.setState({ initialized: true });
    return;
  }
  supabase.auth.getSession().then(({ data }) => {
    useAuth.setState({ session: data.session, initialized: true });
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    useAuth.setState({ session });
    if (session && useSettings.getState().authMode !== 'account') {
      useSettings.getState().set({ authMode: 'account' });
    }
  });
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase!.auth.startAutoRefresh();
    else supabase!.auth.stopAutoRefresh();
  });
}

function codeFromUrl(url: string): { code?: string; error?: string } {
  const parsed = Linking.parse(url);
  const params = parsed.queryParams ?? {};
  const hash = url.includes('#') ? new URLSearchParams(url.split('#')[1]) : null;
  const error = (params.error_description as string) ?? hash?.get('error_description') ?? undefined;
  return { code: params.code as string | undefined, error };
}

/** Completes a PKCE sign-in from a deep link (magic link or OAuth redirect). */
export async function handleAuthUrl(url: string): Promise<boolean> {
  if (!supabase || !url.includes('auth-callback')) return false;
  const { code, error } = codeFromUrl(url);
  if (error) throw new Error(error);
  if (!code) return false;
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
  return true;
}

export async function signInWithGoogle(): Promise<boolean> {
  if (!supabase) throw new Error('Cloud sign-in is not configured.');
  const redirectTo = redirectUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return false;
  return handleAuthUrl(result.url);
}

export async function signInWithPassword(email: string, password: string) {
  if (!supabase) throw new Error('Cloud sign-in is not configured.');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUpWithPassword(email: string, password: string): Promise<{ needsConfirmation: boolean }> {
  if (!supabase) throw new Error('Cloud sign-in is not configured.');
  const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectUrl() } });
  if (error) throw error;
  return { needsConfirmation: !data.session };
}

export async function sendMagicLink(email: string) {
  if (!supabase) throw new Error('Cloud sign-in is not configured.');
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectUrl() } });
  if (error) throw error;
}

export async function sendPasswordReset(email: string) {
  if (!supabase) throw new Error('Cloud sign-in is not configured.');
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
  if (error) throw error;
}

export async function signOut() {
  await supabase?.auth.signOut();
}

/** Deletes the account and all cloud data. Local data must be cleared by the caller. */
export async function deleteAccount() {
  if (!supabase) throw new Error('Cloud sign-in is not configured.');
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  if (error) throw error;
  await supabase.auth.signOut({ scope: 'local' });
}
