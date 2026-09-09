import { describe, expect, it } from 'vitest';
import { computeHealthStatus, computeSuggestions, type HealthSignals } from './health';

const DAY_MS = 24 * 60 * 60 * 1000;
const PUBLISHED_AT = new Date('2026-01-01T00:00:00Z');

function signals(overrides: Partial<HealthSignals> = {}): HealthSignals {
  return {
    publishedAt: PUBLISHED_AT,
    lastActivityAt: null,
    contributorCount: 0,
    totalRoleCount: 2,
    activeRoleCount: 0,
    cardCount: 0,
    ...overrides,
  };
}

describe('computeHealthStatus (fixed-clock boundary tests)', () => {
  it('NEW: immediately after publishing, regardless of activity', () => {
    const now = new Date(PUBLISHED_AT.getTime());
    expect(computeHealthStatus(signals(), now)).toBe('NEW');
  });

  it('NEW: still within the 7-day grace period (6 days, 23h59m59s in)', () => {
    const now = new Date(PUBLISHED_AT.getTime() + 7 * DAY_MS - 1000);
    expect(computeHealthStatus(signals(), now)).toBe('NEW');
  });

  it('past NEW at exactly 7 days, with real recent activity and >1 contributor: ACTIVE', () => {
    const now = new Date(PUBLISHED_AT.getTime() + 7 * DAY_MS);
    expect(computeHealthStatus(signals({ lastActivityAt: now, contributorCount: 2 }), now)).toBe('ACTIVE');
  });

  it('past NEW but only 0-1 contributors: FRAGILE even with fresh activity', () => {
    const now = new Date(PUBLISHED_AT.getTime() + 7 * DAY_MS);
    expect(computeHealthStatus(signals({ lastActivityAt: now, contributorCount: 1 }), now)).toBe('FRAGILE');
  });

  it('FRAGILE: activity is 14+ days stale, just past the boundary', () => {
    const lastActivityAt = new Date(PUBLISHED_AT.getTime() + 30 * DAY_MS);
    const now = new Date(lastActivityAt.getTime() + 14 * DAY_MS);
    expect(computeHealthStatus(signals({ lastActivityAt, contributorCount: 3 }), now)).toBe('FRAGILE');
  });

  it('still ACTIVE at 1ms under the 14-day staleness boundary', () => {
    const lastActivityAt = new Date(PUBLISHED_AT.getTime() + 30 * DAY_MS);
    const now = new Date(lastActivityAt.getTime() + 14 * DAY_MS - 1);
    expect(computeHealthStatus(signals({ lastActivityAt, contributorCount: 3 }), now)).toBe('ACTIVE');
  });

  it('DORMANT: activity is 30+ days stale, exactly at the boundary', () => {
    const lastActivityAt = new Date(PUBLISHED_AT.getTime() + 30 * DAY_MS);
    const now = new Date(lastActivityAt.getTime() + 30 * DAY_MS);
    expect(computeHealthStatus(signals({ lastActivityAt, contributorCount: 5 }), now)).toBe('DORMANT');
  });

  it('DORMANT: never had any activity at all, well past the NEW grace period', () => {
    const now = new Date(PUBLISHED_AT.getTime() + 45 * DAY_MS);
    expect(computeHealthStatus(signals({ lastActivityAt: null }), now)).toBe('DORMANT');
  });

  it('is a pure function - same input, same output', () => {
    const now = new Date(PUBLISHED_AT.getTime() + 20 * DAY_MS);
    const input = signals({ lastActivityAt: now, contributorCount: 4 });
    expect(computeHealthStatus(input, now)).toBe(computeHealthStatus(input, now));
  });
});

describe('computeSuggestions', () => {
  it('suggests creating the first real card once past NEW with zero cards', () => {
    const suggestions = computeSuggestions(signals({ contributorCount: 2 }), 'ACTIVE');
    expect(suggestions.map((s) => s.code)).toContain('CREATE_FIRST_CARD');
  });

  it('never suggests creating a first card while still NEW (too early to nudge)', () => {
    const suggestions = computeSuggestions(signals(), 'NEW');
    expect(suggestions.map((s) => s.code)).not.toContain('CREATE_FIRST_CARD');
  });

  it('suggests improving the intro when FRAGILE', () => {
    const suggestions = computeSuggestions(signals({ contributorCount: 1 }), 'FRAGILE');
    expect(suggestions.map((s) => s.code)).toContain('IMPROVE_INTRO');
  });

  it('suggests recruiting for an under-active role when one role has zero contributors and another does not', () => {
    const suggestions = computeSuggestions(signals({ totalRoleCount: 2, activeRoleCount: 1, contributorCount: 3 }), 'ACTIVE');
    expect(suggestions.map((s) => s.code)).toContain('RECRUIT_UNDERACTIVE_ROLE');
  });

  it('does not suggest recruiting when every role already has activity', () => {
    const suggestions = computeSuggestions(signals({ totalRoleCount: 2, activeRoleCount: 2, contributorCount: 3 }), 'ACTIVE');
    expect(suggestions.map((s) => s.code)).not.toContain('RECRUIT_UNDERACTIVE_ROLE');
  });

  it('suggests archiving or referring to a similar space only when DORMANT', () => {
    const dormant = computeSuggestions(signals(), 'DORMANT');
    expect(dormant.map((s) => s.code)).toContain('CONSIDER_ARCHIVE_OR_SIMILAR');

    const active = computeSuggestions(signals({ contributorCount: 3 }), 'ACTIVE');
    expect(active.map((s) => s.code)).not.toContain('CONSIDER_ARCHIVE_OR_SIMILAR');
  });

  it('never fabricates a suggestion that implies an automatic action - every code is purely advisory text, no merge/transfer/archive is ever performed by this function', () => {
    const suggestions = computeSuggestions(signals(), 'DORMANT');
    // The function returns codes only - no side effects, no space
    // mutation, and nothing resembling a merge/transfer action code exists
    // in this module's vocabulary at all.
    for (const suggestion of suggestions) {
      expect(['CREATE_FIRST_CARD', 'IMPROVE_INTRO', 'RECRUIT_UNDERACTIVE_ROLE', 'CONSIDER_ARCHIVE_OR_SIMILAR']).toContain(
        suggestion.code
      );
    }
  });
});
