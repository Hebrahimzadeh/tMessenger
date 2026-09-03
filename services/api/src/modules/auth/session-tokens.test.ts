import { describe, expect, it } from 'vitest';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  accessTokenCookieOptions,
  InvalidAccessTokenError,
  REFRESH_TOKEN_MAX_AGE_SECONDS,
  refreshTokenCookieOptions,
  signAccessToken,
  verifyAccessToken,
} from './session-tokens';

const secret = 'test-only-session-hmac-secret';

describe('signAccessToken / verifyAccessToken', () => {
  it('round-trips the user id', () => {
    const token = signAccessToken('user-123', secret);
    const payload = verifyAccessToken(token, secret);
    expect(payload.sub).toBe('user-123');
  });

  it('sets exp to iat + 15 minutes', () => {
    let now = 1_000_000_000_000;
    const token = signAccessToken('user-123', secret, () => now);
    const payload = verifyAccessToken(token, secret, () => now);
    expect(payload.exp - payload.iat).toBe(ACCESS_TOKEN_TTL_SECONDS);
    expect(ACCESS_TOKEN_TTL_SECONDS).toBe(15 * 60);
  });

  it('rejects a token verified after it has expired', () => {
    let now = 1_000_000_000_000;
    const token = signAccessToken('user-123', secret, () => now);

    now += (ACCESS_TOKEN_TTL_SECONDS + 1) * 1000;
    expect(() => verifyAccessToken(token, secret, () => now)).toThrow(InvalidAccessTokenError);
  });

  it('accepts a token right up to (but not past) its expiry', () => {
    let now = 1_000_000_000_000;
    const token = signAccessToken('user-123', secret, () => now);

    now += ACCESS_TOKEN_TTL_SECONDS * 1000 - 1000;
    expect(() => verifyAccessToken(token, secret, () => now)).not.toThrow();
  });

  it('rejects a token signed with a different secret', () => {
    const token = signAccessToken('user-123', secret);
    expect(() => verifyAccessToken(token, 'a-different-secret')).toThrow(InvalidAccessTokenError);
  });

  it('rejects a token with a tampered payload (userId swapped)', () => {
    const token = signAccessToken('user-123', secret);
    const [payloadB64, signature] = token.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64!, 'base64url').toString('utf8'));
    const tamperedPayload = Buffer.from(JSON.stringify({ ...payload, sub: 'attacker-999' }), 'utf8').toString(
      'base64url'
    );
    const tamperedToken = `${tamperedPayload}.${signature}`;

    expect(() => verifyAccessToken(tamperedToken, secret)).toThrow(InvalidAccessTokenError);
  });

  it('rejects a structurally malformed token instead of throwing an unrelated error', () => {
    expect(() => verifyAccessToken('not-a-real-token', secret)).toThrow(InvalidAccessTokenError);
    expect(() => verifyAccessToken('', secret)).toThrow(InvalidAccessTokenError);
  });
});

describe('cookie options', () => {
  it('access token cookie: HttpOnly, SameSite=Lax, path "/", secure only in production', () => {
    expect(accessTokenCookieOptions(false)).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', secure: false });
    expect(accessTokenCookieOptions(true)).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', secure: true });
  });

  it('refresh token cookie: scoped to /v1/auth, 30-day maxAge, HttpOnly, SameSite=Lax, secure only in production', () => {
    const options = refreshTokenCookieOptions(true);
    expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/v1/auth', secure: true });
    expect(options.maxAge).toBe(REFRESH_TOKEN_MAX_AGE_SECONDS);
    expect(REFRESH_TOKEN_MAX_AGE_SECONDS).toBe(30 * 24 * 60 * 60);
  });
});
