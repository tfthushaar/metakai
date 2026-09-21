import { base64Url, formBody, grantedScopes, jwtClaims, parseRedirect, redirectScheme } from '../oauth';

const jwt = (claims: object) => {
  const b64 = (o: object) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'RS256' })}.${b64(claims)}.signature`;
};

describe('redirectScheme', () => {
  it('turns a client ID into the scheme Google returns to', () => {
    expect(redirectScheme('510560795620-abc123.apps.googleusercontent.com')).toBe('com.googleusercontent.apps.510560795620-abc123');
  });
});

describe('base64Url', () => {
  it('makes base64 safe for a URL and drops padding', () => {
    expect(base64Url('ab+/cd==')).toBe('ab-_cd');
    expect(base64Url('abcd')).toBe('abcd');
  });
});

describe('formBody', () => {
  it('encodes each field', () => {
    expect(formBody({ grant_type: 'authorization_code', redirect_uri: 'com.example:/oauth2redirect', code: 'a b&c' })).toBe(
      'grant_type=authorization_code&redirect_uri=com.example%3A%2Foauth2redirect&code=a%20b%26c',
    );
  });
});

describe('jwtClaims', () => {
  it('reads the email from an ID token', () => {
    expect(jwtClaims(jwt({ email: 'me@example.com', aud: 'client', exp: 1790000000 }))).toMatchObject({ email: 'me@example.com', aud: 'client' });
  });

  it('reads names with accents and other scripts', () => {
    expect(jwtClaims(jwt({ name: 'José Ñandú 山田' })).name).toBe('José Ñandú 山田');
  });

  it('gives nothing for a token that is not one', () => {
    expect(jwtClaims('not a token')).toEqual({});
    expect(jwtClaims('a.b.c')).toEqual({});
    expect(jwtClaims('')).toEqual({});
  });
});

describe('parseRedirect', () => {
  it('reads the code and state Google sends back', () => {
    expect(parseRedirect('com.googleusercontent.apps.1-x:/oauth2redirect?state=abc&code=4%2F0AfJ&scope=email%20openid')).toEqual({ code: '4/0AfJ', state: 'abc', error: null });
  });

  it('reads an error', () => {
    expect(parseRedirect('com.googleusercontent.apps.1-x:/oauth2redirect?error=access_denied&state=abc')).toEqual({ code: null, state: 'abc', error: 'access_denied' });
  });

  it('copes with a URL that has nothing', () => {
    expect(parseRedirect('com.googleusercontent.apps.1-x:/oauth2redirect')).toEqual({ code: null, state: null, error: null });
  });
});

describe('grantedScopes', () => {
  it('splits the scope string', () => {
    expect(grantedScopes('openid email https://www.googleapis.com/auth/drive.appdata')).toEqual(['openid', 'email', 'https://www.googleapis.com/auth/drive.appdata']);
    expect(grantedScopes(undefined)).toEqual([]);
  });
});
