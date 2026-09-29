import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@taavon/database';
import {
  createPrismaBookmarkRepository,
  createPrismaPinRepository,
  createPrismaReactionRepository,
} from './card-engagement.repository';

async function probeDatabaseAvailability(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 3000));
    const probe = getPrisma().$queryRaw`SELECT 1`.then(() => 'ok' as const);
    return (await Promise.race([probe, timeout])) === 'ok';
  } catch {
    return false;
  }
}

const databaseAvailable = await probeDatabaseAvailability();

describe.skipIf(!databaseAvailable)('ReactionRepository / BookmarkRepository / PinRepository: real Postgres', () => {
  const reactionRepo = createPrismaReactionRepository(getPrisma());
  const bookmarkRepo = createPrismaBookmarkRepository(getPrisma());
  const pinRepo = createPrismaPinRepository(getPrisma());

  let creatorId: string;
  let userId: string;
  let spaceId: string;
  let cardId: string;
  let card2Id: string;

  beforeAll(async () => {
    creatorId = (await getPrisma().user.create({ data: {} })).id;
    userId = (await getPrisma().user.create({ data: {} })).id;
    const space = await getPrisma().space.create({
      data: { slug: `engagement-test-${Date.now()}`, creatorId, status: 'PUBLISHED', searchText: 'x' },
    });
    spaceId = space.id;

    const makeCard = async (caption: string) => {
      const card = await getPrisma().card.create({ data: { spaceId, authorId: creatorId, kind: 'AWARENESS', status: 'ACTIVE' } });
      await getPrisma().cardRevision.create({ data: { cardId: card.id, revisionNumber: 1, body: caption, editorId: creatorId } });
      return card.id;
    };
    cardId = await makeCard('کارت اول');
    card2Id = await makeCard('کارت دوم');
  });

  afterEach(async () => {
    await getPrisma().cardReaction.deleteMany({ where: { cardId: { in: [cardId, card2Id] } } });
    await getPrisma().cardBookmark.deleteMany({ where: { cardId: { in: [cardId, card2Id] } } });
    await getPrisma().auditEvent.deleteMany({ where: { targetType: 'Card', targetId: { in: [cardId, card2Id] } } });
    await getPrisma().cardPin.deleteMany({ where: { spaceId } });
  });

  afterAll(async () => {
    await getPrisma().cardRevision.deleteMany({ where: { cardId: { in: [cardId, card2Id] } } });
    await getPrisma().card.deleteMany({ where: { id: { in: [cardId, card2Id] } } });
    await getPrisma().space.deleteMany({ where: { id: spaceId } });
    await getPrisma().user.deleteMany({ where: { id: { in: [creatorId, userId] } } });
  });

  it('toggle is idempotent via the unique (cardId, userId, type) constraint', async () => {
    expect(await reactionRepo.toggle(cardId, userId, 'SUPPORT')).toBe('added');
    expect(await reactionRepo.toggle(cardId, userId, 'SUPPORT')).toBe('removed');

    const rows = await getPrisma().cardReaction.findMany({ where: { cardId, userId } });
    expect(rows).toHaveLength(0);
  });

  it('summary counts per type and reports the caller\'s own reactions', async () => {
    await reactionRepo.toggle(cardId, userId, 'LIKE');
    await reactionRepo.toggle(cardId, userId, 'SUPPORT');
    await reactionRepo.toggle(cardId, creatorId, 'SUPPORT');
    await reactionRepo.toggle(cardId, userId, 'USEFUL');

    const summary = await reactionRepo.summary(cardId, userId);
    // LIKE is the one a card actually shows; the rest stay valid values.
    expect(summary.counts).toEqual({ LIKE: 1, SUPPORT: 2, USEFUL: 1, INTERESTED: 0, CELEBRATE: 0 });
    expect(summary.mine.sort()).toEqual(['LIKE', 'SUPPORT', 'USEFUL']);
  });

  it('pin writes a CardPin row and an AuditEvent; unpin removes the row and audits again', async () => {
    await pinRepo.pin({ spaceId, cardId, pinnedById: creatorId, position: 0, correlationId: 'corr-1' });
    expect(await pinRepo.isPinned(cardId)).toBe(true);

    const audit1 = await getPrisma().auditEvent.findMany({ where: { targetType: 'Card', targetId: cardId } });
    expect(audit1.map((a) => a.action)).toEqual(['card.pinned']);

    const removed = await pinRepo.unpin({ spaceId, cardId, actorId: creatorId, correlationId: 'corr-2' });
    expect(removed).toBe(true);
    expect(await pinRepo.isPinned(cardId)).toBe(false);

    const audit2 = await getPrisma().auditEvent.findMany({ where: { targetType: 'Card', targetId: cardId }, orderBy: { createdAt: 'asc' } });
    expect(audit2.map((a) => a.action)).toEqual(['card.pinned', 'card.unpinned']);
  });

  it('unpinning a card that is not pinned is a safe no-op', async () => {
    await expect(pinRepo.unpin({ spaceId, cardId, actorId: creatorId, correlationId: 'corr-x' })).resolves.toBe(false);
  });

  it('list returns pinned cards ordered by position with their current caption', async () => {
    await pinRepo.pin({ spaceId, cardId: card2Id, pinnedById: creatorId, position: 0, correlationId: 'c1' });
    await pinRepo.pin({ spaceId, cardId, pinnedById: creatorId, position: 1, correlationId: 'c2' });

    const list = await pinRepo.list(spaceId);
    expect(list.map((p) => p.cardId)).toEqual([card2Id, cardId]);
    expect(list[0]!.caption).toBe('کارت دوم');
  });

  it('bookmarking toggles idempotently and stays the caller\'s own', async () => {
    expect(await bookmarkRepo.toggle(cardId, userId)).toBe('added');
    expect(await bookmarkRepo.isBookmarked(cardId, userId)).toBe(true);
    // Nobody else's bookmark appears, and none is invented for them.
    expect(await bookmarkRepo.isBookmarked(cardId, creatorId)).toBe(false);

    expect(await bookmarkRepo.toggle(cardId, userId)).toBe('removed');
    expect(await bookmarkRepo.isBookmarked(cardId, userId)).toBe(false);
  });

  it('lists the caller\'s bookmarked cards newest-saved first, with the caption and their own state', async () => {
    await bookmarkRepo.toggle(cardId, userId);
    await bookmarkRepo.toggle(card2Id, userId);
    await reactionRepo.toggle(card2Id, userId, 'LIKE');

    const { rows, lastBookmark } = await bookmarkRepo.listByUser(userId, { limit: 10, before: null });

    // Saving card2 last puts it at the top: the order is when they saved it,
    // not when the card was published.
    expect(rows.map((row) => row.id)).toEqual([card2Id, cardId]);
    expect(rows[0]).toMatchObject({ body: 'کارت دوم', bookmarkedByMe: true, likedByMe: true, likeCount: 1 });
    expect(rows[1]).toMatchObject({ bookmarkedByMe: true, likedByMe: false, likeCount: 0 });
    expect(lastBookmark).not.toBeNull();
  });

  it('leaves a bookmark on a card that stopped being visible out of the list, without deleting it', async () => {
    await bookmarkRepo.toggle(cardId, userId);
    await getPrisma().card.update({ where: { id: cardId }, data: { status: 'ARCHIVED' } });

    const { rows } = await bookmarkRepo.listByUser(userId, { limit: 10, before: null });
    expect(rows.map((row) => row.id)).not.toContain(cardId);
    // The row is still there - nothing was removed behind their back.
    expect(await bookmarkRepo.isBookmarked(cardId, userId)).toBe(true);

    await getPrisma().card.update({ where: { id: cardId }, data: { status: 'ACTIVE' } });
  });

  it('isSpaceEditor is true for the space creator', async () => {
    await expect(pinRepo.isSpaceEditor(creatorId, spaceId)).resolves.toBe(true);
    await expect(pinRepo.isSpaceEditor(userId, spaceId)).resolves.toBe(false);
  });
});
