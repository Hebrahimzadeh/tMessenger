import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, computeTotpCode, generateTotpSecret, totpUri, verifyTotpCode } from './totp';

describe('base32Encode / base32Decode', () => {
  it('round-trips arbitrary bytes', () => {
    const original = Buffer.from('hello world, this is a test secret!', 'utf8');
    expect(base32Decode(base32Encode(original))).toEqual(original);
  });

  it('encodes the RFC 4648 test vector for "foobar"', () => {
    // https://datatracker.ietf.org/doc/html/rfc4648#section-10
    expect(base32Encode(Buffer.from('foobar', 'utf8'))).toBe('MZXW6YTBOI');
  });

  it('is case-insensitive and ignores padding on decode', () => {
    const original = Buffer.from('foobar', 'utf8');
    expect(base32Decode('mzxw6ytboi')).toEqual(original);
    expect(base32Decode('MZXW6YTBOI======')).toEqual(original);
  });
});

// RFC 6238 Appendix B's own published test vectors - 8-digit codes, 30s
// step, T0=0. This is the strongest available proof the HOTP/dynamic-
// truncation core is standards-compliant, not just self-consistent.
// https://datatracker.ietf.org/doc/html/rfc6238#appendix-B
describe('computeTotpCode: RFC 6238 Appendix B test vectors (SHA1, 8 digits)', () => {
  const secretBase32 = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

  const vectors: Array<[number, string]> = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
  ];

  for (const [unixSeconds, expected] of vectors) {
    it(`T=${unixSeconds}s -> ${expected}`, () => {
      const code = computeTotpCode(secretBase32, { at: unixSeconds * 1000, digits: 8, algorithm: 'sha1' });
      expect(code).toBe(expected);
    });
  }
});

describe('generateTotpSecret', () => {
  it('generates a unique, valid base32 secret each call', () => {
    const secrets = new Set(Array.from({ length: 20 }, () => generateTotpSecret()));
    expect(secrets.size).toBe(20);
    for (const secret of secrets) {
      expect(() => base32Decode(secret)).not.toThrow();
    }
  });
});

describe('totpUri', () => {
  it('builds a valid otpauth:// URI carrying the secret, issuer, and account label', () => {
    const uri = totpUri('JBSWY3DPEHPK3PXP', 'ali_2000', 'Taavon-Afarini');
    const parsed = new URL(uri);
    expect(parsed.protocol).toBe('otpauth:');
    expect(parsed.host).toBe('totp');
    expect(parsed.searchParams.get('secret')).toBe('JBSWY3DPEHPK3PXP');
    expect(parsed.searchParams.get('issuer')).toBe('Taavon-Afarini');
    expect(decodeURIComponent(parsed.pathname)).toContain('ali_2000');
  });
});

describe('verifyTotpCode (production defaults: SHA1, 6 digits, 30s step)', () => {
  const secret = generateTotpSecret();
  const now = 1_700_000_000_000;

  it('accepts the correct current code', () => {
    const code = computeTotpCode(secret, { at: now });
    expect(verifyTotpCode(secret, code, { at: now })).toBe(true);
  });

  it('rejects an incorrect code', () => {
    expect(verifyTotpCode(secret, '000000', { at: now })).toBe(false);
  });

  it('accepts a code from one step before or after (clock drift tolerance)', () => {
    const previousStepCode = computeTotpCode(secret, { at: now - 30_000 });
    const nextStepCode = computeTotpCode(secret, { at: now + 30_000 });
    expect(verifyTotpCode(secret, previousStepCode, { at: now })).toBe(true);
    expect(verifyTotpCode(secret, nextStepCode, { at: now })).toBe(true);
  });

  it('rejects a code more than one step away', () => {
    const farCode = computeTotpCode(secret, { at: now + 300_000 });
    expect(verifyTotpCode(secret, farCode, { at: now })).toBe(false);
  });

  it('rejects a structurally different code length without throwing', () => {
    expect(verifyTotpCode(secret, '12345', { at: now })).toBe(false);
    expect(verifyTotpCode(secret, '', { at: now })).toBe(false);
  });
});
