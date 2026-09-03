import { describe, expect, it } from 'vitest';
import {
  generateChallengeId,
  generateOtpCode,
  generateRefreshToken,
  hashOtpCode,
  hashRefreshToken,
  otpCodeMatches,
} from './otp-crypto';

describe('generateOtpCode', () => {
  it('returns a 6-digit numeric string', () => {
    const code = generateOtpCode();
    expect(code).toMatch(/^\d{6}$/);
  });

  it('zero-pads short random values to 6 digits', () => {
    // Statistical: with 1000 draws, at least one should need padding
    // (P(none < 100000 in 1000 draws) is astronomically small).
    const codes = Array.from({ length: 1000 }, () => generateOtpCode());
    expect(codes.some((c) => c.startsWith('0'))).toBe(true);
    expect(codes.every((c) => c.length === 6)).toBe(true);
  });

  it('produces different values across calls (CSPRNG, not fixed)', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateOtpCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe('hashOtpCode / otpCodeMatches', () => {
  const secret = 'test-only-otp-hmac-secret';

  it('is deterministic for the same code and secret', () => {
    expect(hashOtpCode('123456', secret)).toBe(hashOtpCode('123456', secret));
  });

  it('differs for a different code', () => {
    expect(hashOtpCode('123456', secret)).not.toBe(hashOtpCode('654321', secret));
  });

  it('differs for a different secret', () => {
    expect(hashOtpCode('123456', secret)).not.toBe(hashOtpCode('123456', 'a-different-secret'));
  });

  it('never stores the raw code inside the hash', () => {
    expect(hashOtpCode('123456', secret)).not.toContain('123456');
  });

  it('otpCodeMatches returns true for the correct code', () => {
    const stored = hashOtpCode('123456', secret);
    expect(otpCodeMatches('123456', stored, secret)).toBe(true);
  });

  it('otpCodeMatches returns false for a wrong code', () => {
    const stored = hashOtpCode('123456', secret);
    expect(otpCodeMatches('000000', stored, secret)).toBe(false);
  });

  it('otpCodeMatches returns false for a malformed/wrong-length stored hash rather than throwing', () => {
    expect(otpCodeMatches('123456', 'not-a-real-hash', secret)).toBe(false);
  });
});

describe('generateChallengeId', () => {
  it('returns a UUID-shaped string', () => {
    expect(generateChallengeId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('is unique across calls', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateChallengeId()));
    expect(ids.size).toBe(50);
  });
});

describe('generateRefreshToken / hashRefreshToken', () => {
  it('generates a high-entropy, unique token each call', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateRefreshToken()));
    expect(tokens.size).toBe(50);
    for (const token of tokens) {
      expect(token.length).toBeGreaterThanOrEqual(32);
    }
  });

  it('hashRefreshToken is deterministic and never contains the raw token', () => {
    const token = generateRefreshToken();
    const hash = hashRefreshToken(token);
    expect(hashRefreshToken(token)).toBe(hash);
    expect(hash).not.toContain(token);
  });

  it('hashRefreshToken differs for different tokens', () => {
    expect(hashRefreshToken(generateRefreshToken())).not.toBe(hashRefreshToken(generateRefreshToken()));
  });
});
