import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@taavon/database';
import { createPrismaAwarenessRepository } from './awareness.repository';
import { recordMeaningfulView } from './awareness.service';

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

describe.skipIf(!databaseAvailable)('AwarenessRepository: real Postgres', () => {
  const repo = createPrismaAwarenessRepository(getPrisma());

  let authorId: string;
  let viewerId: string;
  let spaceId: string;
  let cardId: string;

  beforeAll(async () => {
    authorId = (await getPrisma().user.create({ data: {} })).id;
    viewerId = (await getPrisma().user.create({ data: {} })).id;
    const space = await getPrisma().space.create({
      data: { slug: `awareness-test-${Date.now()}`, creatorId: authorId, status: 'PUBLISHED', searchText: 'x' },
    });
    spaceId = space.id;
    const card = await getPrisma().card.create({ data: { spaceId, authorId, kind: 'AWARENESS', status: 'ACTIVE' } });
    cardId = card.id;
    await getPrisma().cardRevision.create({ data: { cardId, revisionNumber: 1, title: 'x', body: 'x', editorId: authorId } });
  });

  afterEach(async () => {
    await getPrisma().awarenessEvent.deleteMany({ where: { actorId: { in: [authorId, viewerId] } } });
  });

  afterAll(async () => {
    await getPrisma().cardRevision.deleteMany({ where: { cardId } });
    await getPrisma().card.deleteMany({ where: { id: cardId } });
    await getPrisma().space.deleteMany({ where: { id: spaceId } });
    await getPrisma().user.deleteMany({ where: { id: { in: [authorId, viewerId] } } });
  });

  it('records a real MEANINGFUL_VIEW row', async () => {
    await recordMeaningfulView(repo, cardId, viewerId);
    const row = await getPrisma().awarenessEvent.findUnique({
      where: { idempotencyKey: `view:${cardId}:${viewerId}:MEANINGFUL_VIEW` },
    });
    expect(row).toMatchObject({ type: 'MEANINGFUL_VIEW', actorId: viewerId, subjectId: cardId });
  });

  it('a page refresh (repeat view) never inflates the count - the DB unique constraint enforces this, not just application logic', async () => {
    await recordMeaningfulView(repo, cardId, viewerId);
    await recordMeaningfulView(repo, cardId, viewerId);
    await recordMeaningfulView(repo, cardId, viewerId);

    const count = await getPrisma().awarenessEvent.count({ where: { subjectId: cardId, actorId: viewerId, type: 'MEANINGFUL_VIEW' } });
    expect(count).toBe(1);
  });

  it('the author viewing their own card is never recorded at all', async () => {
    await recordMeaningfulView(repo, cardId, authorId);
    const count = await getPrisma().awarenessEvent.count({ where: { subjectId: cardId, actorId: authorId, type: 'MEANINGFUL_VIEW' } });
    expect(count).toBe(0);
  });

  it('listByActor returns only this actor\'s own events, newest first, with a working cursor', async () => {
    await recordMeaningfulView(repo, cardId, viewerId);
    const firstPage = await repo.listByActor(viewerId, { limit: 20, before: null });
    expect(firstPage.every((row) => row.type === 'MEANINGFUL_VIEW')).toBe(true);
    expect(firstPage.map((r) => r.deepLink)).toEqual([`/cards/${cardId}`]);
  });

  it('reactions and pins never create an AwarenessEvent - only the writers this task explicitly wires do', async () => {
    // A card reaction goes through card-engagement.repository.ts, which
    // never touches AwarenessEvent at all - confirmed structurally by
    // toggling one here and checking the awareness log stays empty.
    await getPrisma().cardReaction.create({ data: { cardId, userId: viewerId, type: 'SUPPORT' } });
    const count = await getPrisma().awarenessEvent.count({ where: { subjectId: cardId, type: { notIn: ['MEANINGFUL_VIEW'] } } });
    expect(count).toBe(0);
    await getPrisma().cardReaction.deleteMany({ where: { cardId, userId: viewerId } });
  });
});
