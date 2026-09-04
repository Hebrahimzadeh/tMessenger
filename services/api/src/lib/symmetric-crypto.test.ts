import { describe, expect, it } from 'vitest';
import { decrypt, encrypt } from './symmetric-crypto';

const SECRET = 'test-only-symmetric-crypto-secret';

describe('encrypt / decrypt', () => {
  it('round-trips a value', () => {
    const ciphertext = encrypt('hello world', SECRET);
    expect(decrypt(ciphertext, SECRET)).toBe('hello world');
  });

  it('never contains the plaintext', () => {
    const ciphertext = encrypt('super-secret-value', SECRET);
    expect(ciphertext).not.toContain('super-secret-value');
  });

  it('produces a different ciphertext each call (random IV)', () => {
    expect(encrypt('same value', SECRET)).not.toBe(encrypt('same value', SECRET));
  });

  it('fails to decrypt with the wrong secret', () => {
    const ciphertext = encrypt('hello world', SECRET);
    expect(() => decrypt(ciphertext, 'a-different-secret')).toThrow();
  });

  it('fails to decrypt tampered ciphertext', () => {
    const ciphertext = encrypt('hello world', SECRET);
    const tampered = ciphertext.slice(0, -4) + 'abcd';
    expect(() => decrypt(tampered, SECRET)).toThrow();
  });
});
