import { describe, expect, it } from 'vitest';
import { getAvatarColor, getAvatarInitials } from './avatar';

describe('getAvatarInitials', () => {
  it('takes the first letter of the first two words for a multi-word name', () => {
    expect(getAvatarInitials('علی رضایی')).toBe('عر');
  });

  it('takes the first two characters for a single-word name', () => {
    expect(getAvatarInitials('علی')).toBe('عل');
  });

  it('falls back to "?" for an empty or whitespace-only name', () => {
    expect(getAvatarInitials('')).toBe('?');
    expect(getAvatarInitials('   ')).toBe('?');
  });

  it('uppercases Latin initials', () => {
    expect(getAvatarInitials('ali rezaei')).toBe('AR');
  });
});

describe('getAvatarColor', () => {
  it('is deterministic - the same seed always yields the same color', () => {
    expect(getAvatarColor('user-123')).toBe(getAvatarColor('user-123'));
  });

  it('returns a valid CSS hex color', () => {
    expect(getAvatarColor('user-123')).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('varies across different seeds (not a constant)', () => {
    const colors = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((seed) => getAvatarColor(seed)));
    expect(colors.size).toBeGreaterThan(1);
  });
});
