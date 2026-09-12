import { describe, expect, it } from 'vitest';
import { ACCESS_TOKEN_COOKIE, signAccessToken, ACCESS_TOKEN_TTL_SECONDS } from '../auth/session-tokens';
import {
  authenticateHandshake,
  HandshakeOriginRejectedError,
  HandshakeUnauthorizedError,
  readCookie,
} from './realtime-auth';

const SECRET = 'test-only-session-hmac-key';
const APP_ORIGIN = 'https://app.example';
const USER = '11111111-1111-4111-8111-111111111111';

function cookieHeader(token: string): string {
  return `theme=dark; ${ACCESS_TOKEN_COOKIE}=${token}; other=1`;
}

describe('readCookie', () => {
  it('finds a cookie among others and ignores lookalike names', () => {
    expect(readCookie('a=1; access_token=abc; b=2', ACCESS_TOKEN_COOKIE)).toBe('abc');
    expect(readCookie('not_access_token=abc', ACCESS_TOKEN_COOKIE)).toBeUndefined();
    expect(readCookie(undefined, ACCESS_TOKEN_COOKIE)).toBeUndefined();
    expect(readCookie('', ACCESS_TOKEN_COOKIE)).toBeUndefined();
  });

  it('decodes a percent-encoded value', () => {
    expect(readCookie('access_token=a%20b', ACCESS_TOKEN_COOKIE)).toBe('a b');
  });
});

describe('the handshake', () => {
  it('admits a valid session from the application\'s own origin', () => {
    const token = signAccessToken(USER, SECRET);
    const result = authenticateHandshake(
      { cookie: cookieHeader(token), origin: APP_ORIGIN },
      { sessionHmacKey: SECRET, appOrigin: APP_ORIGIN }
    );
    expect(result).toEqual({ userId: USER });
  });

  it('refuses a connection with no session cookie at all', () => {
    expect(() =>
      authenticateHandshake({ cookie: 'theme=dark', origin: APP_ORIGIN }, { sessionHmacKey: SECRET, appOrigin: APP_ORIGIN })
    ).toThrow(HandshakeUnauthorizedError);

    expect(() =>
      authenticateHandshake({ cookie: undefined, origin: APP_ORIGIN }, { sessionHmacKey: SECRET, appOrigin: APP_ORIGIN })
    ).toThrow(HandshakeUnauthorizedError);
  });

  it('refuses a tampered or wrongly-signed token', () => {
    const token = signAccessToken(USER, SECRET);
    const [payload] = token.split('.') as [string, string];

    for (const forged of [
      `${payload}.deadbeef`,
      signAccessToken(USER, 'a-different-secret'),
      'not-even-a-token',
      `${payload}`,
    ]) {
      expect(() =>
        authenticateHandshake(
          { cookie: cookieHeader(forged), origin: APP_ORIGIN },
          { sessionHmacKey: SECRET, appOrigin: APP_ORIGIN }
        )
      ).toThrow(HandshakeUnauthorizedError);
    }
  });

  it('refuses an expired token', () => {
    const issuedAt = Date.now();
    const token = signAccessToken(USER, SECRET, () => issuedAt);
    const wellAfterExpiry = () => issuedAt + (ACCESS_TOKEN_TTL_SECONDS + 60) * 1000;

    expect(() =>
      authenticateHandshake(
        { cookie: cookieHeader(token), origin: APP_ORIGIN },
        { sessionHmacKey: SECRET, appOrigin: APP_ORIGIN, now: wellAfterExpiry }
      )
    ).toThrow(HandshakeUnauthorizedError);
  });

  // A browser applies no CORS preflight to a WebSocket handshake and will
  // attach cookies to a cross-origin one, so this check is the only thing
  // standing between a logged-in visitor and any page that wants to read
  // their private conversations.
  it('refuses any origin but the application\'s own, even with a perfectly valid session', () => {
    const token = signAccessToken(USER, SECRET);

    for (const origin of [
      'https://evil.example',
      'http://app.example',
      'https://app.example.evil.com',
      'https://app.example:8443',
      'null',
    ]) {
      expect(() =>
        authenticateHandshake(
          { cookie: cookieHeader(token), origin },
          { sessionHmacKey: SECRET, appOrigin: APP_ORIGIN }
        ),
        origin
      ).toThrow(HandshakeOriginRejectedError);
    }
  });

  it('refuses a handshake with no origin header at all', () => {
    const token = signAccessToken(USER, SECRET);
    expect(() =>
      authenticateHandshake(
        { cookie: cookieHeader(token), origin: undefined },
        { sessionHmacKey: SECRET, appOrigin: APP_ORIGIN }
      )
    ).toThrow(HandshakeOriginRejectedError);
  });

  it('checks the origin before the cookie, so a hostile origin learns nothing about the session', () => {
    // Both are wrong here. The error must be the origin one: replying
    // "your session is invalid" to a foreign origin would confirm the
    // gateway got as far as looking at the cookie it sent.
    expect(() =>
      authenticateHandshake(
        { cookie: 'access_token=garbage', origin: 'https://evil.example' },
        { sessionHmacKey: SECRET, appOrigin: APP_ORIGIN }
      )
    ).toThrow(HandshakeOriginRejectedError);
  });
});
