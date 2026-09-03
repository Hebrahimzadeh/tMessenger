import { describe, expect, it } from 'vitest';
import { CSRF_COOKIE, CSRF_HEADER, csrfCookieOptions, csrfMatches, generateCsrfToken } from './csrf';

describe('generateCsrfToken', () => {
  it('generates a high-entropy, unique token each call', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateCsrfToken()));
    expect(tokens.size).toBe(50);
    for (const token of tokens) {
      expect(token.length).toBeGreaterThanOrEqual(32);
    }
  });
});

describe('csrfCookieOptions', () => {
  it('is NOT HttpOnly (client JS must read it to echo it back), SameSite=Lax, path "/"', () => {
    expect(csrfCookieOptions(false)).toMatchObject({ httpOnly: false, sameSite: 'lax', path: '/', secure: false });
  });

  it('is Secure in production', () => {
    expect(csrfCookieOptions(true)).toMatchObject({ secure: true });
  });
});

function fakeRequest(cookieValue: string | undefined, headerValue: string | undefined) {
  return {
    cookies: { [CSRF_COOKIE]: cookieValue },
    headers: { [CSRF_HEADER]: headerValue },
  };
}

describe('csrfMatches', () => {
  it('returns true when the header matches the cookie', () => {
    const token = generateCsrfToken();
    expect(csrfMatches(fakeRequest(token, token))).toBe(true);
  });

  it('returns false when the header is missing', () => {
    expect(csrfMatches(fakeRequest(generateCsrfToken(), undefined))).toBe(false);
  });

  it('returns false when the cookie is missing', () => {
    expect(csrfMatches(fakeRequest(undefined, generateCsrfToken()))).toBe(false);
  });

  it('returns false when both are missing', () => {
    expect(csrfMatches(fakeRequest(undefined, undefined))).toBe(false);
  });

  it('returns false when they differ', () => {
    expect(csrfMatches(fakeRequest(generateCsrfToken(), generateCsrfToken()))).toBe(false);
  });

  it('returns false when they differ only in length, without throwing', () => {
    expect(csrfMatches(fakeRequest('short', 'a-much-longer-value-than-short'))).toBe(false);
  });
});
