import { describe, expect, it } from 'vitest';
import { toPersianDigits } from './persian-digits';

describe('toPersianDigits', () => {
  it('converts every ASCII digit to its Persian equivalent', () => {
    expect(toPersianDigits('0123456789')).toBe('۰۱۲۳۴۵۶۷۸۹');
  });

  it('leaves non-digit characters untouched', () => {
    expect(toPersianDigits('05:00')).toBe('۰۵:۰۰');
    expect(toPersianDigits('0 / 320')).toBe('۰ / ۳۲۰');
  });
});
