/**
 * Pure helpers for signing in to Google in a browser tab with OAuth's authorization-code flow and
 * PKCE, as the free-software build does (core/google.foss.ts): encoding, forms, tokens and redirects.
 */

/** The custom URL scheme Google gives an OAuth client, which its sign-in page returns to. */
export const redirectScheme = (clientId: string) => `com.googleusercontent.apps.${clientId.replace('.apps.googleusercontent.com', '')}`;

/** Base64 made safe for URLs and PKCE: `+` and `/` swapped, no padding. */
export const base64Url = (base64: string) => base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** An application/x-www-form-urlencoded body. */
export const formBody = (fields: Record<string, string>) =>
  Object.entries(fields)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');

/** The claims inside a JWT (like a Google ID token), or an empty object if it isn't one. Signatures are not checked here. */
export function jwtClaims(token: string): Record<string, unknown> {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = atob(part.padEnd(Math.ceil(part.length / 4) * 4, '='));
    // The payload is UTF-8; turn it back into text.
    return JSON.parse(decodeURIComponent(bytes.split('').map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')));
  } catch {
    return {};
  }
}

export interface RedirectResult {
  code: string | null;
  state: string | null;
  error: string | null;
}

/** What Google sent back to the app's redirect URL. */
export function parseRedirect(url: string): RedirectResult {
  const query = url.split('#')[0].split('?')[1] ?? '';
  const values = new Map<string, string>();
  for (const pair of query.split('&')) {
    const [key, value = ''] = pair.split('=');
    if (key) values.set(decodeURIComponent(key), decodeURIComponent(value.replace(/\+/g, ' ')));
  }
  return { code: values.get('code') ?? null, state: values.get('state') ?? null, error: values.get('error') ?? null };
}

/** The scopes a token response says were granted. */
export const grantedScopes = (scope: unknown): string[] => (typeof scope === 'string' ? scope.split(' ').filter(Boolean) : []);
