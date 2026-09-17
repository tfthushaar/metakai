import { describe, expect, it } from 'vitest';

import { corsHeaders, issueSession, revokeApple, userId, type AuthEnv } from '../src/auth';

const env: AuthEnv = {
  GOOGLE_CLIENT_ID: 'web-client',
  APPLE_BUNDLE_ID: 'com.tfthushaar.metakai',
  ID_PEPPER: 'pepper',
  SESSION_SECRET: 'a-long-random-session-secret-for-tests',
};

const request = (token?: string) => new Request('https://api.test/v1/me', { headers: token ? { authorization: `Bearer ${token}` } : {} });

describe('auth', () => {
  it('accepts Metakai sessions', async () => {
    const session = await issueSession(env, 'user-hash');
    await expect(userId(request(session), env)).resolves.toBe('user-hash');
  });

  it('rejects sessions signed with another secret', async () => {
    const session = await issueSession({ ...env, SESSION_SECRET: 'another-secret-entirely-different' }, 'user-hash');
    await expect(userId(request(session), env)).rejects.toMatchObject({ status: 401 });
  });

  it('rejects missing and malformed tokens', async () => {
    await expect(userId(request(), env)).rejects.toMatchObject({ status: 401 });
    await expect(userId(request('not-a-jwt'), env)).rejects.toMatchObject({ status: 401 });
  });

  it('only allows the dev bypass when enabled', async () => {
    await expect(userId(request('dev:alice'), env)).rejects.toMatchObject({ status: 401 });
    const id = await userId(request('dev:alice'), { ...env, DEV_AUTH: '1' });
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('skips Apple revocation when not configured', async () => {
    await expect(revokeApple(env, 'code')).resolves.toBe(false);
    await expect(revokeApple({ ...env, APPLE_TEAM_ID: 'T', APPLE_KEY_ID: 'K', APPLE_PRIVATE_KEY: 'P' }, undefined)).resolves.toBe(false);
  });

  it('allows CORS only for the website', () => {
    expect(corsHeaders('https://tfthushaar.github.io')['access-control-allow-origin']).toBe('https://tfthushaar.github.io');
    expect(corsHeaders('https://evil.example')).toEqual({});
    expect(corsHeaders(null)).toEqual({});
  });
});
