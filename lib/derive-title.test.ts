import { describe, expect, it } from 'vitest';
import { deriveTitlePreview } from './derive-title';

describe('deriveTitlePreview', () => {
  it('uses an explicit title verbatim', () => {
    expect(deriveTitlePreview('عنوان من', 'بدنه')).toBe('عنوان من');
  });

  it('derives from the first line of the body when no title is given', () => {
    expect(deriveTitlePreview('', 'خط اول\nخط دوم')).toBe('خط اول');
  });

  it('falls back to a fixed placeholder for an empty body and title', () => {
    expect(deriveTitlePreview('', '')).toBe('کارت بدون عنوان');
  });

  it('truncates a long first line', () => {
    const longLine = 'الف '.repeat(80).trim();
    expect(deriveTitlePreview('', longLine).length).toBeLessThanOrEqual(80);
  });
});
