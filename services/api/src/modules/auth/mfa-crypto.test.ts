import { describe, expect, it } from 'vitest';
import { generateRecoveryCodes, hashRecoveryCode } from './mfa-crypto';

describe('generateRecoveryCodes', () => {
  it('generates 10 unique codes by default', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
  });

  it('generates codes in a consistent, readable format', () => {
    const codes = generateRecoveryCodes();
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z2-7]{4}-[A-Z2-7]{4}$/);
    }
  });

  it('supports a custom count', () => {
    expect(generateRecoveryCodes(5)).toHaveLength(5);
  });
});

describe('hashRecoveryCode', () => {
  it('is deterministic for the same code', () => {
    expect(hashRecoveryCode('ABCD-2345')).toBe(hashRecoveryCode('ABCD-2345'));
  });

  it('differs for different codes', () => {
    expect(hashRecoveryCode('ABCD-2345')).not.toBe(hashRecoveryCode('WXYZ-6789'));
  });

  it('never contains the raw code', () => {
    expect(hashRecoveryCode('ABCD-2345')).not.toContain('ABCD-2345');
  });

  it('normalizes case before hashing, so a user retyping in lowercase still matches', () => {
    expect(hashRecoveryCode('abcd-2345')).toBe(hashRecoveryCode('ABCD-2345'));
  });
});
