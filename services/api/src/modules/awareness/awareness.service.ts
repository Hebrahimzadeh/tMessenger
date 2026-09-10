import type { AwarenessEventType } from '@taavon/database';

export class CardNotFoundForViewError extends Error {
  constructor() {
    super('Card not found.');
    this.name = 'CardNotFoundForViewError';
  }
}

export class InvalidParticipationCursorError extends Error {
  constructor() {
    super('Invalid pagination cursor.');
    this.name = 'InvalidParticipationCursorError';
  }
}

export interface ParticipationItem {
  type: AwarenessEventType;
  createdAt: Date;
  deepLink: string | null;
}

export interface ParticipationCursor {
  createdAt: string;
  id: string;
}

export interface AwarenessRepository {
  getCardAuthorId(cardId: string): Promise<string | null>;
  /** Idempotent - a repeat view by the same (cardId, viewerId) pair is a no-op, per `AwarenessEvent.idempotencyKey`. */
  recordMeaningfulView(cardId: string, viewerId: string, deepLink: string): Promise<void>;
  listByActor(
    actorId: string,
    params: { limit: number; before: ParticipationCursor | null }
  ): Promise<Array<ParticipationItem & { id: string }>>;
}

/**
 * "dedup view و bot/internal traffic را در تست تعریف کن" - a view only
 * ever counts once per (card, viewer) pair for all time (the idempotency
 * key enforces this at the repository/DB level, not here), and the card's
 * own author viewing their own card is never counted at all - the
 * trivial, ever-present "internal" signal a real reach metric must
 * exclude. `recorded: false` is not an error; it is simply "this view did
 * not count", which is the correct, silent outcome for a self-view.
 */
export async function recordMeaningfulView(
  repo: AwarenessRepository,
  cardId: string,
  viewerId: string
): Promise<{ recorded: boolean }> {
  const authorId = await repo.getCardAuthorId(cardId);
  if (authorId === null) throw new CardNotFoundForViewError();
  if (authorId === viewerId) return { recorded: false };

  await repo.recordMeaningfulView(cardId, viewerId, `/cards/${cardId}`);
  return { recorded: true };
}

export interface ParticipationListResult {
  items: ParticipationItem[];
  nextCursor: string | null;
}

/**
 * "صفحهٔ مشارکت‌های من timeline خصوصی و pagination زمانی داشته باشد؛
 * filter chip، tab دسته، search، score، summary یا «اقدام باز» نساز" - the
 * only parameters this ever accepts are `limit`/`cursor`; there is no
 * category, status, filter, or search parameter anywhere in this
 * function's signature for a route to even expose. Ordering is strictly
 * `(createdAt desc, id desc)` - a private, purely chronological log of the
 * caller's own actions.
 */
export async function listMyParticipations(
  repo: AwarenessRepository,
  actorId: string,
  params: { limit: number; cursor?: string }
): Promise<ParticipationListResult> {
  const before = params.cursor ? decodeCursor(params.cursor) : null;
  const rows = await repo.listByActor(actorId, { limit: params.limit + 1, before });
  const hasMore = rows.length > params.limit;
  const page = rows.slice(0, params.limit);
  const last = page[page.length - 1];

  return {
    items: page.map(({ type, createdAt, deepLink }) => ({ type, createdAt, deepLink })),
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null,
  };
}

function encodeCursor(cursor: ParticipationCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(raw: string): ParticipationCursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as { createdAt: unknown }).createdAt === 'string' &&
      typeof (parsed as { id: unknown }).id === 'string'
    ) {
      return parsed as ParticipationCursor;
    }
    throw new Error('shape');
  } catch {
    throw new InvalidParticipationCursorError();
  }
}
