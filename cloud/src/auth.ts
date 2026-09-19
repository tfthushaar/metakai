import { createRemoteJWKSet, decodeProtectedHeader, importPKCS8, jwtVerify, SignJWT } from 'jose';

/**
 * Sign-in for the leaderboards. Android sends Google ID tokens with every request. iOS signs in with
 * Apple once and gets a Metakai session, since Apple can't refresh identity tokens silently.
 * Accounts are stored only as a salted hash of the provider's subject.
 */

export interface AuthEnv {
  /** OAuth web client ID the Android app requests Google ID tokens for. */
  GOOGLE_CLIENT_ID: string;
  /** iOS bundle ID, the audience of Sign in with Apple tokens. */
  APPLE_BUNDLE_ID: string;
  /** Secret mixed into user IDs so they can't be linked back to Google or Apple accounts. */
  ID_PEPPER: string;
  /** Signs Metakai sessions. */
  SESSION_SECRET?: string;
  /** Sign in with Apple key, used to revoke Apple tokens when someone deletes their profile. */
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;
  APPLE_PRIVATE_KEY?: string;
  /** Local development only (set in .dev.vars): accepts `Bearer dev:<name>` tokens. */
  DEV_AUTH?: string;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
const APPLE_ISSUER = 'https://appleid.apple.com';
const SESSION_ISSUER = 'metakai';
const SESSION_DAYS = 180;

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function sessionKey(env: AuthEnv): Uint8Array {
  if (!env.SESSION_SECRET) throw new HttpError(503, 'Leaderboards are being set up. Try again soon.');
  return new TextEncoder().encode(env.SESSION_SECRET);
}

export function issueSession(env: AuthEnv, userId: string): Promise<string> {
  return new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setIssuer(SESSION_ISSUER).setSubject(userId).setIssuedAt().setExpirationTime(`${SESSION_DAYS}d`).sign(sessionKey(env));
}

/** Verifies a Sign in with Apple identity token and returns the Metakai user ID. */
export async function appleUserId(env: AuthEnv, identityToken: string): Promise<string> {
  try {
    const { payload } = await jwtVerify(identityToken, APPLE_JWKS, { issuer: APPLE_ISSUER, audience: env.APPLE_BUNDLE_ID });
    if (!payload.sub) throw new Error('no subject');
    return sha256(`apple:${payload.sub}:${env.ID_PEPPER}`);
  } catch {
    throw new HttpError(401, 'Apple sign-in failed. Try again.');
  }
}

/** The Metakai user ID behind a Google ID token issued to the Metakai web client. */
export async function googleUserId(env: AuthEnv, idToken: string): Promise<string> {
  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: env.GOOGLE_CLIENT_ID,
  });
  if (!payload.sub) throw new Error('no subject');
  return sha256(`${payload.sub}:${env.ID_PEPPER}`);
}

/** The Metakai user ID for a request's bearer token. */
export async function userId(req: Request, env: AuthEnv): Promise<string> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Sign in required.');
  if (!env.ID_PEPPER) throw new HttpError(503, 'Leaderboards are being set up. Try again soon.');
  if (env.DEV_AUTH === '1' && token.startsWith('dev:')) return sha256(`${token}:${env.ID_PEPPER}`);
  let alg: string | undefined;
  try {
    alg = decodeProtectedHeader(token).alg;
  } catch {
    throw new HttpError(401, 'Sign in required.');
  }
  try {
    if (alg === 'HS256') {
      const { payload } = await jwtVerify(token, sessionKey(env), { issuer: SESSION_ISSUER, algorithms: ['HS256'] });
      if (!payload.sub) throw new Error('no subject');
      return payload.sub;
    }
    return await googleUserId(env, token);
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(401, 'Your sign-in expired. Try again.');
  }
}

/**
 * Revokes the user's Sign in with Apple tokens, as Apple requires when an account is deleted.
 * Needs a fresh authorization code from the app. Returns false if revocation isn't configured or fails.
 */
export async function revokeApple(env: AuthEnv, authorizationCode: string | undefined): Promise<boolean> {
  if (!authorizationCode || !env.APPLE_TEAM_ID || !env.APPLE_KEY_ID || !env.APPLE_PRIVATE_KEY) return false;
  try {
    const key = await importPKCS8(env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n'), 'ES256');
    const clientSecret = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: env.APPLE_KEY_ID })
      .setIssuer(env.APPLE_TEAM_ID)
      .setSubject(env.APPLE_BUNDLE_ID)
      .setAudience(APPLE_ISSUER)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(key);
    const post = (path: string, fields: Record<string, string>) =>
      fetch(`${APPLE_ISSUER}/auth/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: env.APPLE_BUNDLE_ID, client_secret: clientSecret, ...fields }),
      });
    const tokens = await post('token', { code: authorizationCode, grant_type: 'authorization_code' });
    if (!tokens.ok) return false;
    const { refresh_token, access_token } = await tokens.json<{ refresh_token?: string; access_token?: string }>();
    const token = refresh_token ?? access_token;
    if (!token) return false;
    const revoked = await post('revoke', { token, token_type_hint: refresh_token ? 'refresh_token' : 'access_token' });
    return revoked.ok;
  } catch (e) {
    console.error('Apple revoke failed', e);
    return false;
  }
}

/** Origins allowed to call the API from a browser: the web app and the account deletion page. */
export const WEB_ORIGINS = ['https://tfthushaar.github.io'];

export function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !WEB_ORIGINS.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}
