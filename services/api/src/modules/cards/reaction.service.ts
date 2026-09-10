import type { CardReactionType } from '@taavon/contracts';
import type { CardStatus, SpaceStatus } from '@taavon/database';
import type { RateLimiter } from '../auth/rate-limiter';

export class CardNotFoundForReactionError extends Error {
  constructor() {
    super('Card not found.');
    this.name = 'CardNotFoundForReactionError';
  }
}

/** The card's space is not PUBLISHED, or the card is not ACTIVE. (An "example" card is only descriptive JSON on a space definition - it has no id to react to at all.) */
export class ReactionsNotAcceptedError extends Error {
  constructor() {
    super('This card does not accept reactions.');
    this.name = 'ReactionsNotAcceptedError';
  }
}

export class ReactionRateLimitedError extends Error {
  retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super('Too many reactions in a short time.');
    this.name = 'ReactionRateLimitedError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface ReactionCounts {
  SUPPORT: number;
  USEFUL: number;
  INTERESTED: number;
  CELEBRATE: number;
}

export interface ReactionSummary {
  counts: ReactionCounts;
  mine: CardReactionType[];
}

export interface ReactionRepository {
  getCardContext(cardId: string): Promise<{ cardStatus: CardStatus; spaceStatus: SpaceStatus } | null>;
  /** Idempotent toggle backed by the `@@unique([cardId, userId, type])` constraint - a repeat removes the reaction rather than inflating a count. */
  toggle(cardId: string, userId: string, type: CardReactionType): Promise<'added' | 'removed'>;
  summary(cardId: string, userId: string | null): Promise<ReactionSummary>;
}

async function requireReactableCard(repo: ReactionRepository, cardId: string): Promise<void> {
  const context = await repo.getCardContext(cardId);
  if (!context) throw new CardNotFoundForReactionError();
  if (context.spaceStatus !== 'PUBLISHED' || context.cardStatus !== 'ACTIVE') throw new ReactionsNotAcceptedError();
}

export async function toggleReaction(
  repo: ReactionRepository,
  rateLimiter: RateLimiter,
  cardId: string,
  userId: string,
  type: CardReactionType
): Promise<{ summary: ReactionSummary; effect: 'added' | 'removed' }> {
  const limit = await rateLimiter.consume(`reaction:user:${userId}`);
  if (!limit.allowed) throw new ReactionRateLimitedError(limit.retryAfterSeconds ?? 60);

  await requireReactableCard(repo, cardId);
  const effect = await repo.toggle(cardId, userId, type);
  const summary = await repo.summary(cardId, userId);
  return { summary, effect };
}

export async function getReactionSummary(
  repo: ReactionRepository,
  cardId: string,
  userId: string | null
): Promise<ReactionSummary> {
  const context = await repo.getCardContext(cardId);
  if (!context) throw new CardNotFoundForReactionError();
  return repo.summary(cardId, userId);
}
