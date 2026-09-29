import type { CardStatus, SpaceStatus } from '@taavon/database';
import type { CardListRow } from './card.service';

export class CardNotFoundForBookmarkError extends Error {
  constructor() {
    super('Card not found.');
    this.name = 'CardNotFoundForBookmarkError';
  }
}

/** The card's space is not PUBLISHED, or the card is not ACTIVE - there is nothing to keep a way back to. */
export class BookmarksNotAcceptedError extends Error {
  constructor() {
    super('This card cannot be bookmarked.');
    this.name = 'BookmarksNotAcceptedError';
  }
}

export interface BookmarkRepository {
  getCardContext(cardId: string): Promise<{ cardStatus: CardStatus; spaceStatus: SpaceStatus } | null>;
  /** Idempotent toggle backed by `@@unique([cardId, userId])` - a repeat removes the bookmark rather than stacking rows. */
  toggle(cardId: string, userId: string): Promise<'added' | 'removed'>;
  isBookmarked(cardId: string, userId: string): Promise<boolean>;
  /** The caller's own bookmarked cards, newest bookmark first, restricted to cards still visible. */
  listByUser(userId: string, params: { limit: number; before: { createdAt: string; id: string } | null }): Promise<{
    rows: CardListRow[];
    lastBookmark: { createdAt: Date; id: string } | null;
  }>;
}

/**
 * Bookmarking is private, so it is deliberately thinner than reacting: no
 * rate limiter, no public count, no event on the card's thread. Nobody else
 * can see it, so there is nothing here anybody could use to manufacture
 * attention - "نشان" is a way back to a card and never a signal about it.
 */
export async function toggleBookmark(
  repo: BookmarkRepository,
  cardId: string,
  userId: string
): Promise<{ bookmarked: boolean }> {
  const context = await repo.getCardContext(cardId);
  if (!context) throw new CardNotFoundForBookmarkError();
  if (context.spaceStatus !== 'PUBLISHED' || context.cardStatus !== 'ACTIVE') throw new BookmarksNotAcceptedError();

  const effect = await repo.toggle(cardId, userId);
  return { bookmarked: effect === 'added' };
}

export async function getBookmarkState(
  repo: BookmarkRepository,
  cardId: string,
  userId: string
): Promise<{ bookmarked: boolean }> {
  const context = await repo.getCardContext(cardId);
  if (!context) throw new CardNotFoundForBookmarkError();
  return { bookmarked: await repo.isBookmarked(cardId, userId) };
}

export interface BookmarkedCardsResult {
  items: CardListRow[];
  nextCursor: string | null;
}

/**
 * The person's own "نشان‌شده‌ها".
 *
 * Ordered by when they saved it, not by when the card was published or how
 * popular it is: this is their shelf, and ranking somebody's own saved list
 * would be the platform deciding which of their bookmarks matters.
 */
export async function listBookmarkedCards(
  repo: BookmarkRepository,
  userId: string,
  params: { limit: number; cursor?: string }
): Promise<BookmarkedCardsResult> {
  const before = params.cursor ? decodeBookmarkCursor(params.cursor) : null;
  const { rows, lastBookmark } = await repo.listByUser(userId, { limit: params.limit + 1, before });
  const hasMore = rows.length > params.limit;

  return {
    items: rows.slice(0, params.limit),
    nextCursor:
      hasMore && lastBookmark
        ? encodeBookmarkCursor({ createdAt: lastBookmark.createdAt.toISOString(), id: lastBookmark.id })
        : null,
  };
}

export class InvalidBookmarkCursorError extends Error {
  constructor() {
    super('Invalid pagination cursor.');
    this.name = 'InvalidBookmarkCursorError';
  }
}

function encodeBookmarkCursor(c: { createdAt: string; id: string }): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

function decodeBookmarkCursor(raw: string): { createdAt: string; id: string } {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as { createdAt: unknown }).createdAt === 'string' &&
      typeof (parsed as { id: unknown }).id === 'string'
    ) {
      return parsed as { createdAt: string; id: string };
    }
    throw new Error('shape');
  } catch {
    throw new InvalidBookmarkCursorError();
  }
}
