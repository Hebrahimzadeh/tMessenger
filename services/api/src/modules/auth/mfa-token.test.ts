import { describe, expect, it } from 'vitest';
import { MFA_TOKEN_TTL_SECONDS, mfaTokenCookieOptions, signMfaToken, verifyMfaToken } from './mfa-token';

const SECRET = 'test-only-session-hmac-key';

describe('signMfaToken / verifyMfaToken', () => {
  it('round-trips the user id', () => {
    const token = signMfaToken('user-123', SECRET);
    expect(verifyMfaToken(token, SECRET, 'user-123')).toBe(true);
  });

  it('rejects a token issued for a different user', () => {
    const token = signMfaToken('user-123', SECRET);
    expect(verifyMfaToken(token, SECRET, 'someone-else')).toBe(false);
  });

  it('sets a 24-hour lifetime', () => {
    expect(MFA_TOKEN_TTL_SECONDS).toBe(24 * 60 * 60);
  });

  it('rejects an expired token', () => {
    let now = 1_000_000_000_000;
    const token = signMfaToken('user-123', SECRET, () => now);
    now += (MFA_TOKEN_TTL_SECONDS + 1) * 1000;
    expect(verifyMfaToken(token, SECRET, 'user-123', () => now)).toBe(false);
  });

  it('rejects a token signed with a different secret', () => {
    const token = signMfaToken('user-123', SECRET);
    expect(verifyMfaToken(token, 'wrong-secret', 'user-123')).toBe(false);
  });

  it('rejects a tampered payload', () => {
    const token = signMfaToken('user-123', SECRET);
    const [, signature] = token.split('.');
    const tampered = Buffer.from(JSON.stringify({ sub: 'attacker', iat: 0, exp: 9_999_999_999 }), 'utf8').toString(
      'base64url'
    );
    expect(verifyMfaToken(`${tampered}.${signature}`, SECRET, 'attacker')).toBe(false);
  });

  it('rejects a structurally malformed token instead of throwing', () => {
    expect(verifyMfaToken('not-a-real-token', SECRET, 'user-123')).toBe(false);
  });
});

describe('mfaTokenCookieOptions', () => {
  it('is HttpOnly, SameSite=Lax, path "/", secure only in production', () => {
    expect(mfaTokenCookieOptions(false)).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', secure: false });
    expect(mfaTokenCookieOptions(true)).toMatchObject({ secure: true });
  });
});
