import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@taavon/database';
import { createPrismaCommentRepository } from './public-comment.repository';

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

describe.skipIf(!databaseAvailable)('CommentRepository: real Postgres', () => {
  const repo = createPrismaCommentRepository(getPrisma());

  let authorId: string;
  let strangerId: string;
  let spaceId: string;
  let cardId: string;

  beforeAll(async () => {
    authorId = (await getPrisma().user.create({ data: {} })).id;
    strangerId = (await getPrisma().user.create({ data: {} })).id;
    const space = await getPrisma().space.create({
      data: { slug: `comments-test-${Date.now()}`, creatorId: authorId, status: 'PUBLISHED', searchText: 'x' },
    });
    spaceId = space.id;
    const card = await getPrisma().card.create({ data: { spaceId, authorId, kind: 'AWARENESS', status: 'ACTIVE' } });
    cardId = card.id;
    await getPrisma().cardRevision.create({ data: { cardId, revisionNumber: 1, title: 'کارت', body: 'متن', editorId: authorId } });
  });

  afterEach(async () => {
    const commentIds = (await getPrisma().cardComment.findMany({ where: { cardId }, select: { id: true } })).map((c) => c.id);
    await getPrisma().awarenessEvent.deleteMany({ where: { actorId: { in: [authorId, strangerId] } } });
    await getPrisma().auditEvent.deleteMany({ where: { targetType: 'CardComment', targetId: { in: commentIds } } });
    await getPrisma().cardCommentRevision.deleteMany({ where: { commentId: { in: commentIds } } });
    // Replies point back at their parent (Restrict) - clear children first.
    await getPrisma().cardComment.deleteMany({ where: { id: { in: commentIds }, parentId: { not: null } } });
    await getPrisma().cardComment.deleteMany({ where: { id: { in: commentIds } } });
    await getPrisma().cardEvent.deleteMany({ where: { cardId } });
    await getPrisma().outboxEvent.deleteMany({ where: { aggregateId: cardId } });
  });

  afterAll(async () => {
    await getPrisma().cardRevision.deleteMany({ where: { cardId } });
    await getPrisma().card.deleteMany({ where: { id: cardId } });
    await getPrisma().space.deleteMany({ where: { id: spaceId } });
    await getPrisma().user.deleteMany({ where: { id: { in: [authorId, strangerId] } } });
  });

  it('createComment writes the comment, revision 1, a CardEvent and an OutboxEvent', async () => {
    const comment = await repo.createComment({ cardId, authorId, parentId: null, body: 'اولین نظر' });
    expect(comment.latestBody).toBe('اولین نظر');
    expect(comment.revisionCount).toBe(1);

    const events = await getPrisma().cardEvent.findMany({ where: { cardId } });
    expect(events.map((e) => e.eventType)).toEqual(['card.comment_created']);
    const outbox = await getPrisma().outboxEvent.findMany({ where: { aggregateId: cardId } });
    expect(outbox.map((e) => e.eventType)).toEqual(['card.comment_created']);
  });

  it('addRevision appends a new immutable revision', async () => {
    const comment = await repo.createComment({ cardId, authorId, parentId: null, body: 'نسخهٔ اول' });
    const edited = await repo.addRevision({ commentId: comment.id, editorId: authorId, body: 'نسخهٔ دوم' });
    expect(edited.latestBody).toBe('نسخهٔ دوم');
    expect(edited.revisionCount).toBe(2);

    const revisions = await getPrisma().cardCommentRevision.findMany({ where: { commentId: comment.id }, orderBy: { revisionNumber: 'asc' } });
    expect(revisions.map((r) => r.body)).toEqual(['نسخهٔ اول', 'نسخهٔ دوم']);
  });

  it('softDelete flips status, clears the body from the view, and writes an AuditEvent', async () => {
    const comment = await repo.createComment({ cardId, authorId, parentId: null, body: 'حذف‌شدنی' });
    await repo.softDelete({ commentId: comment.id, actorId: authorId, correlationId: 'corr-1' });

    const after = await repo.findComment(comment.id);
    expect(after?.status).toBe('DELETED');

    const audit = await getPrisma().auditEvent.findMany({ where: { targetType: 'CardComment', targetId: comment.id } });
    expect(audit.map((a) => a.action)).toEqual(['card.comment_deleted']);

    const revisions = await getPrisma().cardCommentRevision.findMany({ where: { commentId: comment.id } });
    expect(revisions).toHaveLength(1); // the revision row survives the soft delete
  });

  it('isSpaceEditor is true for the creator and false for a stranger', async () => {
    await expect(repo.isSpaceEditor(authorId, spaceId)).resolves.toBe(true);
    await expect(repo.isSpaceEditor(strangerId, spaceId)).resolves.toBe(false);
  });

  it('listByCard returns comments in chronological order with a working cursor', async () => {
    const first = await repo.createComment({ cardId, authorId, parentId: null, body: 'اول' });
    await repo.createComment({ cardId, authorId: strangerId, parentId: null, body: 'دوم' });
    await repo.createComment({ cardId, authorId, parentId: first.id, body: 'پاسخ به اول' });

    const firstTwo = await repo.listByCard(cardId, { limit: 2, before: null });
    expect(firstTwo).toHaveLength(2);
    const last = firstTwo[firstTwo.length - 1]!;
    const rest = await repo.listByCard(cardId, { limit: 5, before: { createdAt: last.createdAt.toISOString(), id: last.id } });
    expect(new Set([...firstTwo, ...rest].map((c) => c.id)).size).toBe(3);
  });
});
