import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@taavon/database';
import { createPrismaAttachmentRepository, createPrismaCardRepository } from './card.repository';

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

describe.skipIf(!databaseAvailable)('CardRepository / AttachmentRepository: real Postgres', () => {
  const cardRepo = createPrismaCardRepository(getPrisma());
  const attachmentRepo = createPrismaAttachmentRepository(getPrisma());

  let authorId: string;
  let otherUserId: string;
  let spaceId: string;

  beforeAll(async () => {
    authorId = (await getPrisma().user.create({ data: {} })).id;
    otherUserId = (await getPrisma().user.create({ data: {} })).id;
    const space = await getPrisma().space.create({
      data: { slug: `cards-test-${randomUUID()}`, creatorId: authorId, status: 'PUBLISHED', searchText: 'cards test' },
    });
    spaceId = space.id;
  });

  afterEach(async () => {
    const cardIds = (await getPrisma().card.findMany({ where: { spaceId }, select: { id: true } })).map((c) => c.id);
    await getPrisma().awarenessEvent.deleteMany({ where: { actorId: { in: [authorId, otherUserId] } } });
    await getPrisma().cardEvent.deleteMany({ where: { cardId: { in: cardIds } } });
    await getPrisma().cardAttachment.deleteMany({ where: { OR: [{ cardId: { in: cardIds } }, { ownerId: { in: [authorId, otherUserId] } }] } });
    await getPrisma().cardSemanticProfile.deleteMany({ where: { cardId: { in: cardIds } } });
    await getPrisma().cardRevision.deleteMany({ where: { cardId: { in: cardIds } } });
    await getPrisma().outboxEvent.deleteMany({ where: { aggregateId: { in: cardIds } } });
    await getPrisma().card.deleteMany({ where: { id: { in: cardIds } } });
  });

  afterAll(async () => {
    await getPrisma().space.deleteMany({ where: { id: spaceId } });
    await getPrisma().user.deleteMany({ where: { id: { in: [authorId, otherUserId] } } });
  });

  it('createCard writes the card, revision 1, semantic profile, a CardEvent and an OutboxEvent atomically', async () => {
    const { id } = await cardRepo.createCard({
      spaceId,
      authorId,
      kind: 'AWARENESS',
      title: 'اطلاعیه',
      body: 'به کمک نیاز دارم برای جابه‌جایی',
      inferredKind: 'REQUEST',
      confidence: 0.7,
      fileAttachmentIds: [],
      links: [{ url: 'https://example.org/info', label: 'اطلاعات' }],
      locations: [{ label: 'پارک محله', approxLat: 35.7, approxLng: 51.4 }],
    });

    const card = await cardRepo.findCard(id);
    expect(card?.latestRevision.revisionNumber).toBe(1);
    expect(card?.inferredKind).toBe('REQUEST');
    expect(card?.attachments.map((a) => a.kind).sort()).toEqual(['APPROXIMATE_LOCATION', 'LINK']);

    const events = await getPrisma().cardEvent.findMany({ where: { cardId: id } });
    expect(events.map((e) => e.eventType)).toEqual(['card.created']);
    const outbox = await getPrisma().outboxEvent.findMany({ where: { aggregateId: id } });
    expect(outbox.map((e) => e.eventType)).toEqual(['card.created']);
  });

  it('addRevision appends an immutable revision and keeps the earlier one intact', async () => {
    const { id } = await cardRepo.createCard({
      spaceId,
      authorId,
      kind: 'AWARENESS',
      title: 'v1',
      body: 'نسخهٔ اول',
      inferredKind: 'AWARENESS',
      confidence: 0.2,
      fileAttachmentIds: [],
      links: [],
      locations: [],
    });

    const { revisionNumber } = await cardRepo.addRevision({
      cardId: id,
      editorId: authorId,
      kind: 'OBSERVATION',
      title: 'v2',
      body: 'نسخهٔ دوم',
      inferredKind: 'OBSERVATION',
      confidence: 0.7,
      fileAttachmentIds: [],
      links: [],
      locations: [],
    });
    expect(revisionNumber).toBe(2);

    const revisions = await getPrisma().cardRevision.findMany({ where: { cardId: id }, orderBy: { revisionNumber: 'asc' } });
    expect(revisions.map((r) => r.body)).toEqual(['نسخهٔ اول', 'نسخهٔ دوم']);

    const card = await cardRepo.findCard(id);
    expect(card?.kind).toBe('OBSERVATION');
    expect(card?.latestRevision.revisionNumber).toBe(2);
  });

  it('a file attachment can be linked to exactly one card; a second attempt rolls back', async () => {
    const { id: attachmentId } = await attachmentRepo.createPending({
      ownerId: authorId,
      kind: 'IMAGE',
      objectKey: `users/${authorId}/card-uploads/${randomUUID()}`,
    });
    await attachmentRepo.markProcessing(attachmentId, {
      objectKey: `users/${authorId}/card-uploads/x`,
      contentType: 'image/png',
      sizeBytes: 10,
      checksumSha256: 'a'.repeat(64),
    });
    await attachmentRepo.markReady(attachmentId);

    const first = await cardRepo.createCard({
      spaceId,
      authorId,
      kind: 'AWARENESS',
      title: 'با عکس',
      body: 'عکس محله',
      inferredKind: 'AWARENESS',
      confidence: 0.2,
      fileAttachmentIds: [attachmentId],
      links: [],
      locations: [],
    });
    expect((await cardRepo.findCard(first.id))?.attachments).toHaveLength(1);

    await expect(
      cardRepo.createCard({
        spaceId,
        authorId,
        kind: 'AWARENESS',
        title: 'دوباره',
        body: 'x',
        inferredKind: 'AWARENESS',
        confidence: 0.2,
        fileAttachmentIds: [attachmentId],
        links: [],
        locations: [],
      })
    ).rejects.toThrow();

    // The failed create left nothing behind.
    const strayCards = await getPrisma().card.findMany({ where: { spaceId, revisions: { some: { title: 'دوباره' } } } });
    expect(strayCards).toHaveLength(0);
  });

  it('listCards returns ACTIVE cards newest-first and paginates with the keyset cursor', async () => {
    for (let i = 0; i < 3; i++) {
      await cardRepo.createCard({
        spaceId,
        authorId,
        kind: 'AWARENESS',
        title: `c${i}`,
        body: `کارت ${i}`,
        inferredKind: 'AWARENESS',
        confidence: 0.2,
        fileAttachmentIds: [],
        links: [],
        locations: [],
      });
    }
    const firstTwo = await cardRepo.listCards(spaceId, { limit: 2, before: null });
    expect(firstTwo).toHaveLength(2);

    const last = firstTwo[firstTwo.length - 1]!;
    const rest = await cardRepo.listCards(spaceId, {
      limit: 5,
      before: { publishedAt: last.publishedAt.toISOString(), id: last.id },
    });
    const allIds = [...firstTwo, ...rest].map((c) => c.id);
    expect(new Set(allIds).size).toBe(3);
  });

  it('markRejected records the reason and the attachment never becomes READY', async () => {
    const { id } = await attachmentRepo.createPending({
      ownerId: otherUserId,
      kind: 'FILE',
      objectKey: `users/${otherUserId}/card-uploads/${randomUUID()}`,
    });
    await attachmentRepo.markRejected(id, 'TYPE_NOT_ALLOWED');
    const found = await attachmentRepo.findById(id);
    expect(found).toMatchObject({ status: 'REJECTED', rejectionReason: 'TYPE_NOT_ALLOWED' });
  });
});
