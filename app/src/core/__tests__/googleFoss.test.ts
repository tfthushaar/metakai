/** Google sign-in in the free build, with the browser, crypto, storage and network stood in for. */

const CLIENT = '111111111111-abcdef.apps.googleusercontent.com';
const SCHEME = 'com.googleusercontent.apps.111111111111-abcdef';
const DRIVE = 'https://www.googleapis.com/auth/drive.appdata';

const mockStore = new Map<string, string>();
const mockKv = new Map<string, string>();
const mockBrowser = { openAuthSessionAsync: jest.fn() };

jest.mock('expo-web-browser', () => mockBrowser);
jest.mock('expo-crypto', () => ({
  getRandomBytes: (n: number) => new Uint8Array(n).fill(7),
  randomUUID: () => 'state-123',
  digestStringAsync: async () => 'ab+/cd==',
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
}));
jest.mock('../secureStore', () => ({
  getItemAsync: async (k: string) => mockStore.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void mockStore.set(k, v),
  deleteItemAsync: async (k: string) => void mockStore.delete(k),
}));
jest.mock('../store/kv', () => ({
  __esModule: true,
  default: {
    getItemSync: (k: string) => mockKv.get(k) ?? null,
    setItemSync: (k: string, v: string) => void mockKv.set(k, v),
    removeItemSync: (k: string) => void mockKv.delete(k),
  },
}));

const jwt = (claims: object) => `x.${btoa(JSON.stringify(claims)).replace(/=+$/, '')}.y`;
const json = (body: object, status = 200) => ({ ok: status < 400, status, json: async () => body });

let google: typeof import('../google.foss');
const fetchMock = jest.fn();

beforeEach(() => {
  process.env.EXPO_PUBLIC_GOOGLE_NATIVE_CLIENT_ID = CLIENT;
  mockStore.clear();
  mockKv.clear();
  fetchMock.mockReset();
  mockBrowser.openAuthSessionAsync.mockReset();
  (globalThis as { fetch: unknown }).fetch = fetchMock;
  jest.isolateModules(() => {
    google = require('../google.foss');
  });
});

/** Google's sign-in page sends the user back with a code for the state the app made. */
const returns = (query: string) => mockBrowser.openAuthSessionAsync.mockResolvedValue({ type: 'success', url: `${SCHEME}:/oauth2redirect?${query}` });

const tokens = (extra: object = {}) => ({
  access_token: 'access-1',
  expires_in: 3600,
  refresh_token: 'refresh-1',
  id_token: jwt({ email: 'me@example.com', sub: '42' }),
  scope: `openid email ${DRIVE}`,
  ...extra,
});

describe('signing in', () => {
  it('sends the browser to Google with PKCE, offline access and the scopes asked for', async () => {
    returns('code=the-code&state=state-123');
    fetchMock.mockResolvedValue(json(tokens()));
    await google.signInWithGoogle('Google Drive backup', [DRIVE]);

    const [url, redirect] = mockBrowser.openAuthSessionAsync.mock.calls[0];
    const q = new URL(url).searchParams;
    expect(url.startsWith('https://accounts.google.com/o/oauth2/v2/auth?')).toBe(true);
    expect(redirect).toBe(`${SCHEME}:/oauth2redirect`);
    expect(q.get('client_id')).toBe(CLIENT);
    expect(q.get('redirect_uri')).toBe(`${SCHEME}:/oauth2redirect`);
    expect(q.get('response_type')).toBe('code');
    expect(q.get('code_challenge')).toBe('ab-_cd');
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('access_type')).toBe('offline');
    expect(q.get('state')).toBe('state-123');
    expect(q.get('scope')?.split(' ')).toEqual(['openid', 'email', DRIVE]);
  });

  it('trades the code for tokens with the PKCE verifier, and keeps the refresh token', async () => {
    returns('code=the-code&state=state-123');
    fetchMock.mockResolvedValue(json(tokens()));
    const user = await google.signInWithGoogle('Google Drive backup', [DRIVE]);

    expect(user).toEqual({ email: 'me@example.com', scopes: ['openid', 'email', DRIVE] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    const body = new URLSearchParams(init.body);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('the-code');
    expect(body.get('client_id')).toBe(CLIENT);
    expect(body.get('redirect_uri')).toBe(`${SCHEME}:/oauth2redirect`);
    expect(body.get('code_verifier')).toBeTruthy();
    expect(body.has('client_secret')).toBe(false);
    expect(mockStore.get('metakai.google.refresh')).toBe('refresh-1');
    await expect(google.currentGoogleUser()).resolves.toEqual({ email: 'me@example.com', scopes: ['openid', 'email', DRIVE] });
  });

  it('gives back null when the user cancels or closes the tab', async () => {
    mockBrowser.openAuthSessionAsync.mockResolvedValue({ type: 'cancel' });
    await expect(google.signInWithGoogle('Google Drive backup')).resolves.toBeNull();
    returns('error=access_denied&state=state-123');
    await expect(google.signInWithGoogle('Google Drive backup')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses an answer that is not for this sign-in', async () => {
    returns('code=the-code&state=someone-elses');
    await expect(google.signInWithGoogle('Google Drive backup')).rejects.toThrow(/failed/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockStore.size).toBe(0);
  });

  it('says so when this build has no OAuth client', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_NATIVE_CLIENT_ID = '';
    delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
    let bare: typeof import('../google.foss');
    jest.isolateModules(() => {
      bare = require('../google.foss');
    });
    await expect(bare!.signInWithGoogle('Google Drive backup')).rejects.toThrow('Google Drive backup is not set up in this build yet.');
    expect(mockBrowser.openAuthSessionAsync).not.toHaveBeenCalled();
  });

  it('keeps access granted earlier when a second feature signs in', async () => {
    returns('code=c1&state=state-123');
    fetchMock.mockResolvedValue(json(tokens()));
    await google.signInWithGoogle('Google Drive backup', [DRIVE]);
    returns('code=c2&state=state-123');
    fetchMock.mockResolvedValue(json(tokens()));
    await google.signInWithGoogle('leaderboards');
    const q = new URL(mockBrowser.openAuthSessionAsync.mock.calls[1][0]).searchParams;
    expect(q.get('scope')?.split(' ')).toContain(DRIVE);
    expect(q.get('login_hint')).toBe('me@example.com');
  });
});

describe('tokens', () => {
  beforeEach(async () => {
    returns('code=the-code&state=state-123');
    fetchMock.mockResolvedValueOnce(json(tokens()));
    await google.signInWithGoogle('Google Drive backup', [DRIVE]);
    fetchMock.mockClear();
  });

  it('hands out the access and ID tokens it already has while they last', async () => {
    await expect(google.googleTokens()).resolves.toMatchObject({ accessToken: 'access-1' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('gets new ones from the refresh token when they run out, or when Google turned one down', async () => {
    fetchMock.mockResolvedValue(json({ access_token: 'access-2', expires_in: 3600, id_token: jwt({ email: 'me@example.com' }) }));
    await google.clearGoogleToken('access-1');
    await expect(google.googleTokens()).resolves.toMatchObject({ accessToken: 'access-2' });
    const body = new URLSearchParams(fetchMock.mock.calls[0][1].body);
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('refresh-1');
    // Clearing some other token leaves the current one alone.
    await google.clearGoogleToken('access-1');
    await google.googleTokens();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('asks to sign in again when access was taken back', async () => {
    fetchMock.mockResolvedValue(json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400));
    await google.clearGoogleToken('access-1');
    await expect(google.googleTokens()).rejects.toThrow('Token has been expired or revoked.');
    await expect(google.currentGoogleUser()).resolves.toBeNull();
    await expect(google.googleTokens()).rejects.toThrow('Sign in with Google again.');
  });

  it('keeps the sign-in through a network failure', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await google.clearGoogleToken('access-1');
    await expect(google.googleTokens()).rejects.toThrow('offline');
    await expect(google.currentGoogleUser()).resolves.not.toBeNull();
  });
});

describe('signing out', () => {
  it('revokes the refresh token and forgets everything', async () => {
    returns('code=the-code&state=state-123');
    fetchMock.mockResolvedValueOnce(json(tokens()));
    await google.signInWithGoogle('Google Drive backup', [DRIVE]);
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(json({}));
    await google.signOutGoogle();
    expect(fetchMock.mock.calls[0][0]).toBe('https://oauth2.googleapis.com/revoke');
    expect(new URLSearchParams(fetchMock.mock.calls[0][1].body).get('token')).toBe('refresh-1');
    expect(mockStore.size).toBe(0);
    await expect(google.currentGoogleUser()).resolves.toBeNull();
    await expect(google.googleTokens()).rejects.toThrow('Sign in with Google again.');
  });
});
