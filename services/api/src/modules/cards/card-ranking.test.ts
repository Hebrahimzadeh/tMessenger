import { describe, expect, it } from 'vitest';
import { baseCardScore, MAX_REACTION_BOOST, rankCards, reactionBoost, type CardRankingSignals } from './card-ranking';

function signals(over: Partial<CardRankingSignals> & { cardId: string }): CardRankingSignals {
  return {
    authorId: `author-${over.cardId}`,
    relevance: 1,
    ageDays: 0,
    reactionCount: 0,
    spaceHealth: 'ACTIVE',
    ...over,
  };
}

describe('reactionBoost', () => {
  it('is capped and never negative', () => {
    expect(reactionBoost(0)).toBe(0);
    expect(reactionBoost(-5)).toBe(0);
    expect(reactionBoost(3)).toBeCloseTo(0.06);
    expect(reactionBoost(1000)).toBe(MAX_REACTION_BOOST);
  });
});

describe('rankCards', () => {
  it('never lets a wildly popular but irrelevant card outrank a relevant one', () => {
    const order = rankCards([
      signals({ cardId: 'relevant', relevance: 0.8, reactionCount: 0, ageDays: 30 }),
      signals({ cardId: 'popular-noise', relevance: 0.02, reactionCount: 5000, ageDays: 0 }),
    ]);
    expect(order[0]).toBe('relevant');
  });

  it('orders by recency when relevance and everything else is equal', () => {
    const order = rankCards([
      signals({ cardId: 'old', ageDays: 40 }),
      signals({ cardId: 'fresh', ageDays: 0 }),
      signals({ cardId: 'mid', ageDays: 10 }),
    ]);
    expect(order).toEqual(['fresh', 'mid', 'old']);
  });

  it('gently down-weights a dormant space\'s card but does not hide it', () => {
    const order = rankCards([
      signals({ cardId: 'dormant', spaceHealth: 'DORMANT', ageDays: 0 }),
      signals({ cardId: 'active', spaceHealth: 'ACTIVE', ageDays: 1 }),
    ]);
    expect(order).toEqual(['active', 'dormant']);
    expect(order).toContain('dormant');
  });

  it('spreads the feed across authors instead of clustering one prolific author', () => {
    const order = rankCards([
      signals({ cardId: 'a1', authorId: 'A', ageDays: 0 }),
      signals({ cardId: 'a2', authorId: 'A', ageDays: 0.1 }),
      signals({ cardId: 'a3', authorId: 'A', ageDays: 0.2 }),
      signals({ cardId: 'b1', authorId: 'B', ageDays: 5 }),
    ]);
    // B's older card is lifted above A's 2nd/3rd by the diversity penalty.
    expect(order.indexOf('b1')).toBeLessThan(order.indexOf('a3'));
    expect(order[0]).toBe('a1');
  });

  it('a small reaction lead only breaks a near-tie, never a real relevance gap', () => {
    const withReactions = baseCardScore(signals({ cardId: 'x', relevance: 0.5, reactionCount: 100 }));
    const withoutButMoreRelevant = baseCardScore(signals({ cardId: 'y', relevance: 0.7, reactionCount: 0 }));
    expect(withoutButMoreRelevant).toBeGreaterThan(withReactions);
  });
});
