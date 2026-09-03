import { describe, expect, it } from 'vitest';
import { decryptPhone, encryptPhone, hashPhone } from './phone-crypto';

const SECRET = 'test-only-phone-encryption-key-32-chars-minimum';
const OTHER_SECRET = 'a-completely-different-secret-key-for-testing12';
const PHONE = '+989191953219';

describe('hashPhone', () => {
  it('is deterministic for the same phone and secret', () => {
    expect(hashPhone(PHONE, SECRET)).toBe(hashPhone(PHONE, SECRET));
  });

  it('produces different hashes for different phone numbers', () => {
    expect(hashPhone(PHONE, SECRET)).not.toBe(hashPhone('+989191953210', SECRET));
  });

  it('produces different hashes for the same phone under different secrets', () => {
    expect(hashPhone(PHONE, SECRET)).not.toBe(hashPhone(PHONE, OTHER_SECRET));
  });

  it('never contains the plaintext phone number', () => {
    expect(hashPhone(PHONE, SECRET)).not.toContain(PHONE);
  });
});

describe('encryptPhone / decryptPhone', () => {
  it('round-trips the exact phone number', () => {
    const ciphertext = encryptPhone(PHONE, SECRET);
    expect(decryptPhone(ciphertext, SECRET)).toBe(PHONE);
  });

  it('produces different ciphertext on every call (random IV), even for the same input', () => {
    expect(encryptPhone(PHONE, SECRET)).not.toBe(encryptPhone(PHONE, SECRET));
  });

  it('never contains the plaintext phone number', () => {
    expect(encryptPhone(PHONE, SECRET)).not.toContain(PHONE);
  });

  it('fails to decrypt with the wrong secret', () => {
    const ciphertext = encryptPhone(PHONE, SECRET);
    expect(() => decryptPhone(ciphertext, OTHER_SECRET)).toThrow();
  });

  it('fails to decrypt tampered ciphertext (authentication tag mismatch)', () => {
    const ciphertext = encryptPhone(PHONE, SECRET);
    const bytes = Buffer.from(ciphertext, 'base64');
    bytes[bytes.length - 1] ^= 0xff; // flip the last byte of the encrypted payload
    const tampered = bytes.toString('base64');
    expect(() => decryptPhone(tampered, SECRET)).toThrow();
  });
});
