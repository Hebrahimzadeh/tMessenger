import type { CardStatus, SpaceStatus } from '@taavon/database';

/** "ترتیب محدود" - a space may pin at most this many cards. */
export const MAX_PINS_PER_SPACE = 5;

export class CardNotFoundForPinError extends Error {
  constructor() {
    super('Card not found.');
    this.name = 'CardNotFoundForPinError';
  }
}

/** "pin/unpin فقط creator/space-admin". */
export class NotSpacePinnerError extends Error {
  constructor() {
    super('Only the space creator or an admin may pin cards.');
    this.name = 'NotSpacePinnerError';
  }
}

/** "suspended/removed/example قابل pin نباشد" - the space is not PUBLISHED or the card is not ACTIVE. */
export class CardNotPinnableError extends Error {
  constructor() {
    super('This card cannot be pinned in its current state.');
    this.name = 'CardNotPinnableError';
  }
}

export class PinLimitReachedError extends Error {
  constructor() {
    super(`A space may pin at most ${MAX_PINS_PER_SPACE} cards.`);
    this.name = 'PinLimitReachedError';
  }
}

export interface PinnedCardRecord {
  cardId: string;
  position: number;
  title: string;
  pinnedAt: Date;
}

export interface PinRepository {
  getCardContext(
    cardId: string
  ): Promise<{ spaceId: string; cardStatus: CardStatus; spaceStatus: SpaceStatus } | null>;
  isSpaceEditor(userId: string, spaceId: string): Promise<boolean>;
  countPins(spaceId: string): Promise<number>;
  isPinned(cardId: string): Promise<boolean>;
  pin(input: { spaceId: string; cardId: string; pinnedById: string; position: number; correlationId: string }): Promise<void>;
  unpin(input: { spaceId: string; cardId: string; actorId: string; correlationId: string }): Promise<boolean>;
  list(spaceId: string): Promise<PinnedCardRecord[]>;
}

export interface PinListResult {
  items: Array<{ cardId: string; position: number; title: string; pinnedAt: string }>;
  limit: number;
}

function toResult(records: PinnedCardRecord[]): PinListResult {
  return {
    items: records
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((r) => ({ cardId: r.cardId, position: r.position, title: r.title, pinnedAt: r.pinnedAt.toISOString() })),
    limit: MAX_PINS_PER_SPACE,
  };
}

async function requirePinner(
  repo: PinRepository,
  cardId: string,
  userId: string
): Promise<{ spaceId: string; cardStatus: CardStatus; spaceStatus: SpaceStatus }> {
  const context = await repo.getCardContext(cardId);
  if (!context) throw new CardNotFoundForPinError();
  if (!(await repo.isSpaceEditor(userId, context.spaceId))) throw new NotSpacePinnerError();
  return context;
}

export async function pinCard(
  repo: PinRepository,
  cardId: string,
  userId: string,
  correlationId: string
): Promise<PinListResult> {
  const context = await requirePinner(repo, cardId, userId);
  if (context.spaceStatus !== 'PUBLISHED' || context.cardStatus !== 'ACTIVE') throw new CardNotPinnableError();

  if (!(await repo.isPinned(cardId))) {
    if ((await repo.countPins(context.spaceId)) >= MAX_PINS_PER_SPACE) throw new PinLimitReachedError();
    await repo.pin({
      spaceId: context.spaceId,
      cardId,
      pinnedById: userId,
      position: await repo.countPins(context.spaceId),
      correlationId,
    });
  }

  return toResult(await repo.list(context.spaceId));
}

export async function unpinCard(
  repo: PinRepository,
  cardId: string,
  userId: string,
  correlationId: string
): Promise<PinListResult> {
  const context = await requirePinner(repo, cardId, userId);
  await repo.unpin({ spaceId: context.spaceId, cardId, actorId: userId, correlationId });
  return toResult(await repo.list(context.spaceId));
}

export async function listPins(repo: PinRepository, spaceId: string): Promise<PinListResult> {
  return toResult(await repo.list(spaceId));
}
