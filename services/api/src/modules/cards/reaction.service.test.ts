import { describe, expect, it } from 'vitest';
import type { CardStatus, SpaceStatus } from '@taavon/database';
import type { CardReactionType } from '@taavon/contracts';
import { createFakeRateLimiter } from '../auth/rate-limiter';
import {
  CardNotFoundForReactionError,
  getReactionSummary,
  ReactionRateLimitedError,
  ReactionsNotAcceptedError,
  toggleReaction,
  type ReactionRepository,
} from './reaction.service';

const CARD = '11111111-1111-4111-8111-111111111111';
const USER_1 = '22222222-2222-4222-8222-222222222222';
const USER_2 = '33333333-3333-4333-8333-333333333333';

function fakeReactionRepo(opts: { cardStatus?: CardStatus; spaceStatus?: SpaceStatus } = {}) {
  const cardStatus: CardStatus = opts.cardStatus ?? 'ACTIVE';
  const spaceStatus: SpaceStatus = opts.spaceStatus ?? 'PUBLISHED';
  const reactions = new Set<string>(); // `${cardId}:${userId}:${type}`

  const repo: ReactionRepository = {
    async getCardContext(cardId) {
      return cardId === CARD ? { cardStatus, spaceStatus } : null;
    },
    async toggle(cardId, userId, type) {
      const key = `${cardId}:${userId}:${type}`;
      if (reactions.has(key)) {
        reactions.delete(key);
        return 'removed';
      }
      reactions.add(key);
      return 'added';
    },
    async summary(cardId, userId) {
      const counts = { SUPPORT: 0, USEFUL: 0, INTERESTED: 0, CELEBRATE: 0 };
      const mine: CardReactionType[] = [];
      for (const key of reactions) {
        const [kCard, kUser, kType] = key.split(':') as [string, string, CardReactionType];
        if (kCard !== cardId) continue;
        counts[kType] += 1;
        if (userId && kUser === userId) mine.push(kType);
      }
      return { counts, mine };
    },
  };

  return repo;
}

describe('toggleReaction', () => {
  it('is idempotent: reacting twice with the same type removes it (no inflated count)', async () => {
    const repo = fakeReactionRepo();
    const limiter = createFakeRateLimiter(100, 60);

    const first = await toggleReaction(repo, limiter, CARD, USER_1, 'SUPPORT');
    expect(first.effect).toBe('added');
    expect(first.summary.counts.SUPPORT).toBe(1);

    const second = await toggleReaction(repo, limiter, CARD, USER_1, 'SUPPORT');
    expect(second.effect).toBe('removed');
    expect(second.summary.counts.SUPPORT).toBe(0);
  });

  it('tracks distinct users and types independently', async () => {
    const repo = fakeReactionRepo();
    const limiter = createFakeRateLimiter(100, 60);
    await toggleReaction(repo, limiter, CARD, USER_1, 'SUPPORT');
    const after = await toggleReaction(repo, limiter, CARD, USER_2, 'USEFUL');
    expect(after.summary.counts).toEqual({ SUPPORT: 1, USEFUL: 1, INTERESTED: 0, CELEBRATE: 0 });
    expect(after.summary.mine).toEqual(['USEFUL']);
  });

  it('is rate-limited per user', async () => {
    const repo = fakeReactionRepo();
    const limiter = createFakeRateLimiter(1, 60);
    await toggleReaction(repo, limiter, CARD, USER_1, 'SUPPORT');
    await expect(toggleReaction(repo, limiter, CARD, USER_1, 'USEFUL')).rejects.toBeInstanceOf(ReactionRateLimitedError);
  });

  it('refuses reactions on a card whose space is not published', async () => {
    const repo = fakeReactionRepo({ spaceStatus: 'ARCHIVED' });
    const limiter = createFakeRateLimiter(100, 60);
    await expect(toggleReaction(repo, limiter, CARD, USER_1, 'SUPPORT')).rejects.toBeInstanceOf(ReactionsNotAcceptedError);
  });

  it('404s for an unknown card', async () => {
    const repo = fakeReactionRepo();
    const limiter = createFakeRateLimiter(100, 60);
    await expect(toggleReaction(repo, limiter, 'unknown', USER_1, 'SUPPORT')).rejects.toBeInstanceOf(CardNotFoundForReactionError);
  });
});

describe('getReactionSummary', () => {
  it('returns an empty "mine" for an anonymous caller', async () => {
    const repo = fakeReactionRepo();
    const limiter = createFakeRateLimiter(100, 60);
    await toggleReaction(repo, limiter, CARD, USER_1, 'CELEBRATE');
    const summary = await getReactionSummary(repo, CARD, null);
    expect(summary.counts.CELEBRATE).toBe(1);
    expect(summary.mine).toEqual([]);
  });
});
