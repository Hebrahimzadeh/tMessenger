import { describe, expect, it } from 'vitest';
import { normalizePersianLetters } from './persian-text';

describe('normalizePersianLetters', () => {
  it('normalizes both ي and ك together', () => {
    expect(normalizePersianLetters('كيفيت')).toBe('کیفیت');
  });

  it('leaves already-Persian text unchanged', () => {
    expect(normalizePersianLetters('کیفیت')).toBe('کیفیت');
  });

  it('leaves Latin text unchanged', () => {
    expect(normalizePersianLetters('hello world')).toBe('hello world');
  });
});
