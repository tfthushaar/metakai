import { flushDb } from './db/engine';

/**
 * Google sign-in for the web build: the browser goes to Google and comes back with an access token
 * and an ID token in the URL fragment (OAuth's browser flow, no client secret or Google script).
 * A redirect works in a home-screen web app on iPhone, where sign-in popups are unreliable.
 * Access tokens last an hour; after that Drive backup asks for one tap to sign in again.
 */

export interface GoogleUser {
  email: string | null;
  scopes: string[];
}

interface Stored {
  accessToken: string;
  idToken: string | null;
  expiresAt: number;
  email: string | null;
  scopes: string[];
}

interface Pending {
  state: string;
  nonce: string;
  purpose: string;
  returnTo: string;
  scopes: string[];
}

const CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
const BASE = process.env.EXPO_BASE_URL ?? '';
const TOKEN_KEY = 'metakai.google.token';
const PENDING_KEY = 'metakai.google.pending';
const BASE_SCOPES = ['openid', 'email'];

const read = <T>(key: string): T | null => {
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
};
const write = (key: string, value: unknown) => window.localStorage.setItem(key, JSON.stringify(value));

function randomId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function jwtPayload(token: string): Record<string, unknown> {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(part), (c) => c.charCodeAt(0))));
  } catch {
    return {};
  }
}

const valid = (t: Stored | null): t is Stored => !!t && t.expiresAt - 60_000 > Date.now();

export function configureGoogle() {}

export function googleError(e: unknown, _what: string): string {
  return e instanceof Error ? e.message : `Couldn't reach Google. Try again.`;
}

/** Sends the browser to Google. The page comes back to the app, where resumeGoogleSignIn() finishes. */
export async function signInWithGoogle(what: string, scopes: string[] = []): Promise<GoogleUser | null> {
  if (!CLIENT_ID) throw new Error('Google sign-in is not set up in this build yet.');
  const stored = read<Stored>(TOKEN_KEY);
  // Keep scopes granted earlier, so signing in for one feature doesn't drop another's access.
  const wanted = [...new Set([...BASE_SCOPES, ...(stored?.scopes ?? []), ...scopes])];
  const pending: Pending = {
    state: randomId(),
    nonce: randomId(),
    purpose: what,
    returnTo: window.location.pathname.startsWith(BASE) ? window.location.pathname.slice(BASE.length) || '/' : '/',
    scopes: wanted,
  };
  write(PENDING_KEY, pending);
  await flushDb();
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: `${window.location.origin}${BASE}/`,
    response_type: 'token id_token',
    scope: wanted.join(' '),
    state: pending.state,
    nonce: pending.nonce,
    include_granted_scopes: 'true',
    ...(stored?.email ? { login_hint: stored.email } : { prompt: 'select_account' }),
  });
  window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  // The page is leaving; nothing after this runs.
  return new Promise<GoogleUser | null>(() => {});
}

export async function currentGoogleUser(): Promise<GoogleUser | null> {
  const t = read<Stored>(TOKEN_KEY);
  return valid(t) ? { email: t.email, scopes: t.scopes } : null;
}

export async function googleTokens(): Promise<{ accessToken: string; idToken: string | null }> {
  const t = read<Stored>(TOKEN_KEY);
  if (!valid(t)) throw new Error('Sign in with Google again.');
  return { accessToken: t.accessToken, idToken: t.idToken };
}

export async function clearGoogleToken(token: string) {
  const t = read<Stored>(TOKEN_KEY);
  if (t?.accessToken === token) write(TOKEN_KEY, { ...t, expiresAt: 0 });
}

export async function signOutGoogle() {
  const t = read<Stored>(TOKEN_KEY);
  window.localStorage.removeItem(TOKEN_KEY);
  if (t && valid(t)) fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t.accessToken)}`, { method: 'POST' }).catch(() => {});
}

/**
 * Finishes a sign-in when Google sends the browser back. Returns what the sign-in was for and the
 * screen to return to, or null if this page load isn't a sign-in return.
 */
export async function resumeGoogleSignIn(): Promise<{ purpose: string; returnTo: string } | null> {
  const hash = window.location.hash.slice(1);
  const pending = read<Pending>(PENDING_KEY);
  if (!hash.includes('state=') || !pending) return null;
  const params = new URLSearchParams(hash);
  window.localStorage.removeItem(PENDING_KEY);
  window.history.replaceState(null, '', `${BASE}/`);
  if (params.get('state') !== pending.state) return null;
  const error = params.get('error');
  if (error) throw new Error(error === 'access_denied' ? 'Google sign-in was cancelled.' : `Google sign-in failed (${error}).`);

  const accessToken = params.get('access_token');
  const idToken = params.get('id_token');
  if (!accessToken) throw new Error('Google sign-in failed. Try again.');
  const claims = idToken ? jwtPayload(idToken) : {};
  if (idToken && claims.nonce !== pending.nonce) throw new Error('Google sign-in failed. Try again.');
  const stored: Stored = {
    accessToken,
    idToken,
    expiresAt: Date.now() + Number(params.get('expires_in') ?? 3600) * 1000,
    email: typeof claims.email === 'string' ? claims.email : (read<Stored>(TOKEN_KEY)?.email ?? null),
    scopes: params.get('scope')?.split(' ') ?? pending.scopes,
  };
  write(TOKEN_KEY, stored);
  return { purpose: pending.purpose, returnTo: pending.returnTo };
}
