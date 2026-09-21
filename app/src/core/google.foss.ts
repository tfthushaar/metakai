import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';

import { base64Url, formBody, grantedScopes, jwtClaims, parseRedirect, redirectScheme } from '../lib/oauth';
import * as SecureStore from './secureStore';
import Storage from './store/kv';

/**
 * Google sign-in for the free-software build, which has no Google Play services. It signs in
 * in a browser tab with OAuth's authorization-code flow and PKCE, so there is no client secret,
 * and Google returns to the app on the OAuth client's own URL scheme. The refresh token stays in the
 * phone's secure storage, so Drive backup and leaderboards keep working without asking again. Replaces google.ts.
 */

export interface GoogleUser {
  email: string | null;
  scopes: string[];
}

interface Info {
  email: string | null;
  scopes: string[];
}

interface Tokens {
  accessToken: string;
  idToken: string | null;
  expiresAt: number;
}

/**
 * An OAuth client that allows a custom URL scheme for its redirect (create it as an iOS client in the
 * Google Cloud console), not the web client the standard build asks Google for ID tokens with.
 */
const CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_NATIVE_CLIENT_ID || process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
const REDIRECT = `${redirectScheme(CLIENT_ID)}:/oauth2redirect`;
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const BASE_SCOPES = ['openid', 'email'];
const REFRESH_KEY = 'metakai.google.refresh';
const INFO_KEY = 'metakai.google.info';

/** Google's answer to a token request that failed, like invalid_grant when access was revoked. */
class GoogleAuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

let memory: Tokens | null = null;

function readInfo(): Info | null {
  try {
    return JSON.parse(Storage.getItemSync(INFO_KEY) ?? 'null');
  } catch {
    return null;
  }
}

const cap = (what: string) => `${what[0].toUpperCase()}${what.slice(1)}`;

export function configureGoogle() {}

export function googleError(e: unknown, _what: string): string {
  return e instanceof Error ? e.message : `Couldn't reach Google. Try again.`;
}

async function pkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64Url(btoa(String.fromCharCode(...Crypto.getRandomBytes(48))));
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.BASE64 });
  return { verifier, challenge: base64Url(digest) };
}

async function tokenRequest(fields: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: formBody({ client_id: CLIENT_ID, ...fields }) });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new GoogleAuthError(String(body.error ?? res.status), typeof body.error_description === 'string' ? body.error_description : `Google sign-in failed (${res.status}).`);
  return body;
}

/** Keeps what a token response brought: the refresh token in secure storage, the rest in memory. */
async function keep(body: Record<string, unknown>, previous: Info | null): Promise<GoogleUser> {
  const accessToken = body.access_token;
  if (typeof accessToken !== 'string') throw new Error('Google sign-in failed. Try again.');
  const idToken = typeof body.id_token === 'string' ? body.id_token : null;
  if (typeof body.refresh_token === 'string') await SecureStore.setItemAsync(REFRESH_KEY, body.refresh_token);
  const claims = idToken ? jwtClaims(idToken) : {};
  const info: Info = {
    email: typeof claims.email === 'string' ? claims.email : (previous?.email ?? null),
    scopes: body.scope !== undefined ? grantedScopes(body.scope) : (previous?.scopes ?? BASE_SCOPES),
  };
  Storage.setItemSync(INFO_KEY, JSON.stringify(info));
  memory = { accessToken, idToken, expiresAt: Date.now() + Number(body.expires_in ?? 3600) * 1000 };
  return info;
}

/** Opens Google in a browser tab, asks for `scopes` too, and comes back. Returns null if the user cancelled. */
export async function signInWithGoogle(what: string, scopes: string[] = []): Promise<GoogleUser | null> {
  if (!CLIENT_ID) throw new Error(`${cap(what)} is not set up in this build yet.`);
  const previous = readInfo();
  // Keep scopes granted earlier, so signing in for one feature doesn't drop another's access.
  const wanted = [...new Set([...BASE_SCOPES, ...(previous?.scopes ?? []), ...scopes])];
  const { verifier, challenge } = await pkce();
  const state = Crypto.randomUUID();
  const query = formBody({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: wanted.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    // A refresh token is what lets backups continue without signing in every hour.
    access_type: 'offline',
    prompt: 'consent select_account',
    include_granted_scopes: 'true',
    ...(previous?.email ? { login_hint: previous.email } : {}),
  });
  const result = await WebBrowser.openAuthSessionAsync(`${AUTH_URL}?${query}`, REDIRECT);
  if (result.type !== 'success') return null;

  const back = parseRedirect(result.url);
  if (back.error) {
    if (back.error === 'access_denied') return null;
    throw new Error(`Google sign-in failed (${back.error}).`);
  }
  if (back.state !== state || !back.code) throw new Error('Google sign-in failed. Try again.');
  try {
    return await keep(await tokenRequest({ grant_type: 'authorization_code', code: back.code, code_verifier: verifier, redirect_uri: REDIRECT }), previous);
  } catch (e) {
    throw new Error(googleError(e, what));
  }
}

/** The signed-in user without showing any UI, or null. */
export async function currentGoogleUser(): Promise<GoogleUser | null> {
  const info = readInfo();
  return info && (await SecureStore.getItemAsync(REFRESH_KEY)) ? info : null;
}

/** A working access token and ID token, refreshed from the saved refresh token when the old ones ran out. */
export async function googleTokens(): Promise<{ accessToken: string; idToken: string | null }> {
  if (memory && memory.expiresAt - 60_000 > Date.now()) return { accessToken: memory.accessToken, idToken: memory.idToken };
  const refresh = await SecureStore.getItemAsync(REFRESH_KEY);
  if (!refresh) throw new Error('Sign in with Google again.');
  try {
    await keep(await tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh }), readInfo());
  } catch (e) {
    // Access was taken back in the Google account: sign in again.
    if (e instanceof GoogleAuthError && e.code === 'invalid_grant') await forget();
    throw e;
  }
  return { accessToken: memory!.accessToken, idToken: memory!.idToken };
}

/** Drops an access token Google turned down, so the next request gets a new one. */
export async function clearGoogleToken(token: string) {
  if (memory?.accessToken === token) memory = null;
}

async function forget() {
  memory = null;
  Storage.removeItemSync(INFO_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => {});
}

export async function signOutGoogle() {
  const refresh = await SecureStore.getItemAsync(REFRESH_KEY).catch(() => null);
  await forget();
  if (refresh) fetch(REVOKE_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: formBody({ token: refresh }) }).catch(() => {});
}

/** Web only: finishes a sign-in the browser came back from. Phones sign in without leaving the app. */
export async function resumeGoogleSignIn(): Promise<{ purpose: string; returnTo: string } | null> {
  return null;
}
