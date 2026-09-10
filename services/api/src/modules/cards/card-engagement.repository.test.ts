import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@taavon/database';
import { createPrismaPinRepository, createPrismaReactionRepository } from './card-engagement.repository';

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

describe.skipIf(!databaseAvailable)('ReactionRepository / PinRepository: real Postgres', () => {
  const reactionRepo = createPrismaReactionRepository(getPrisma());
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

    const makeCard = async (title: string) => {
      const card = await getPrisma().card.create({ data: { spaceId, authorId: creatorId, kind: 'AWARENESS', status: 'ACTIVE' } });
      await getPrisma().cardRevision.create({ data: { cardId: card.id, revisionNumber: 1, title, body: 'x', editorId: creatorId } });
      return card.id;
    };
    cardId = await makeCard('کارت اول');
    card2Id = await makeCard('کارت دوم');
  });

  afterEach(async () => {
    await getPrisma().cardReaction.deleteMany({ where: { cardId: { in: [cardId, card2Id] } } });
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
    await reactionRepo.toggle(cardId, userId, 'SUPPORT');
    await reactionRepo.toggle(cardId, creatorId, 'SUPPORT');
    await reactionRepo.toggle(cardId, userId, 'USEFUL');

    const summary = await reactionRepo.summary(cardId, userId);
    expect(summary.counts).toEqual({ SUPPORT: 2, USEFUL: 1, INTERESTED: 0, CELEBRATE: 0 });
    expect(summary.mine.sort()).toEqual(['SUPPORT', 'USEFUL']);
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

  it('list returns pinned cards ordered by position with their current title', async () => {
    await pinRepo.pin({ spaceId, cardId: card2Id, pinnedById: creatorId, position: 0, correlationId: 'c1' });
    await pinRepo.pin({ spaceId, cardId, pinnedById: creatorId, position: 1, correlationId: 'c2' });

    const list = await pinRepo.list(spaceId);
    expect(list.map((p) => p.cardId)).toEqual([card2Id, cardId]);
    expect(list[0]!.title).toBe('کارت دوم');
  });

  it('isSpaceEditor is true for the space creator', async () => {
    await expect(pinRepo.isSpaceEditor(creatorId, spaceId)).resolves.toBe(true);
    await expect(pinRepo.isSpaceEditor(userId, spaceId)).resolves.toBe(false);
  });
});
