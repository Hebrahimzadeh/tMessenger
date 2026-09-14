import { afterAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@taavon/database';
import { createPrismaNotificationJobRepository } from './repository';
import { runNotificationJob } from './job';

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

/**
 * The consumer against a real database and a real outbox, which is the only
 * place the at-least-once claim can actually be tested: the guarantee rests
 * on a unique index and on transaction ordering, and neither exists in a fake.
 */
describe.skipIf(!databaseAvailable)('draining a real outbox', () => {
  const prisma = getPrisma();
  const repo = createPrismaNotificationJobRepository(prisma);

  const userIds: string[] = [];
  const outboxIds: string[] = [];

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { recipientId: { in: userIds } } });
    await prisma.outboxEvent.deleteMany({ where: { id: { in: outboxIds } } });
    await prisma.cardComment.deleteMany({ where: { authorId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function newUser() {
    const user = await prisma.user.create({ data: {} });
    userIds.push(user.id);
    return user.id;
  }

  /**
   * An outbox row for a comment, with the audience supplied directly so this
   * test does not have to build a whole space/card/comment graph to exercise
   * the consumer.
   */
  async function commentOutboxEvent(cardId: string, commentId: string, authorId: string) {
    const row = await prisma.outboxEvent.create({
      data: {
        aggregateType: 'Card',
        aggregateId: cardId,
        eventType: 'card.comment_created',
        payload: { cardId, commentId, authorId },
      },
    });
    outboxIds.push(row.id);
    return row.id;
  }

  /**
   * The real repository, with only its claim query narrowed to the rows this
   * test created.
   *
   * A shared development database carries a backlog of unprocessed outbox
   * rows from other work, and they would otherwise fill the batch and decide
   * what this test sees. Everything actually under test still runs for real
   * against Postgres: `createIfNew`'s unique index, `markProcessed`'s
   * ordering, and `recordAttempt`'s backoff. Only the input is made
   * deterministic.
   */
  function scopedRepo(recipients: string[], onlyIds: string[] = outboxIds) {
    return {
      ...repo,
      async claimUnprocessed(limit: number) {
        const rows = await repo.claimUnprocessed(500);
        return rows.filter((r) => onlyIds.includes(r.id)).slice(0, limit);
      },
      audience: {
        publicReplyAudience: async () => recipients,
        reservationAudience: async () => recipients,
        spaceAudience: async () => recipients,
      },
    };
  }

  it('turns an outbox row into a notification and marks the row processed', async () => {
    const author = await newUser();
    const reader = await newUser();
    const cardId = crypto.randomUUID();
    const commentId = crypto.randomUUID();
    const eventId = await commentOutboxEvent(cardId, commentId, author);

    const result = await runNotificationJob(scopedRepo([reader], [eventId]));

    expect(result.processedEventIds).toContain(eventId);
    const created = await prisma.notification.findMany({ where: { recipientId: reader } });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ type: 'NEW_PUBLIC_REPLY', subjectId: commentId, deepLink: `/cards/${cardId}` });

    const processed = await prisma.outboxEvent.findUnique({ where: { id: eventId }, select: { processedAt: true } });
    expect(processed?.processedAt).not.toBeNull();
  });

  it('creates nothing extra when the same row is replayed, which is what makes a retry safe', async () => {
    const author = await newUser();
    const reader = await newUser();
    const cardId = crypto.randomUUID();
    const commentId = crypto.randomUUID();
    const eventId = await commentOutboxEvent(cardId, commentId, author);

    await runNotificationJob(scopedRepo([reader], [eventId]));
    // A crash after creating but before marking leaves the row unprocessed;
    // this is that replay.
    await prisma.outboxEvent.update({ where: { id: eventId }, data: { processedAt: null } });
    const second = await runNotificationJob(scopedRepo([reader], [eventId]));

    expect(second.created).toBe(0);
    await expect(prisma.notification.count({ where: { recipientId: reader } })).resolves.toBe(1);
  });

  it('backs a failing row off rather than dropping it or spinning on it', async () => {
    const author = await newUser();
    const cardId = crypto.randomUUID();
    const eventId = await commentOutboxEvent(cardId, crypto.randomUUID(), author);

    const failing = {
      ...scopedRepo([], [eventId]),
      audience: {
        publicReplyAudience: async () => {
          throw new Error('audience lookup exploded');
        },
        reservationAudience: async () => [],
        spaceAudience: async () => [],
      },
    };

    const result = await runNotificationJob(failing);
    expect(result.deferred).toContain(eventId);

    const row = await prisma.outboxEvent.findUnique({
      where: { id: eventId },
      select: { attempts: true, processedAt: true, availableAt: true },
    });
    // Still unprocessed, counted, and pushed into the future so the next run
    // does not immediately spin on it again.
    expect(row?.processedAt).toBeNull();
    expect(row?.attempts).toBe(1);
    expect(row!.availableAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('skips a row that is backed off until its time comes', async () => {
    const author = await newUser();
    const reader = await newUser();
    const eventId = await commentOutboxEvent(crypto.randomUUID(), crypto.randomUUID(), author);
    await prisma.outboxEvent.update({
      where: { id: eventId },
      data: { availableAt: new Date(Date.now() + 60_000) },
    });

    const result = await runNotificationJob(scopedRepo([reader], [eventId]));
    expect(result.processedEventIds).not.toContain(eventId);
  });

  it('treats an event nobody subscribes to as done, so it never clogs the queue', async () => {
    const row = await prisma.outboxEvent.create({
      data: { aggregateType: 'Space', aggregateId: crypto.randomUUID(), eventType: 'space.created', payload: {} },
    });
    outboxIds.push(row.id);

    const result = await runNotificationJob(scopedRepo([], [row.id]));

    expect(result.processedEventIds).toContain(row.id);
    expect(result.deferred).not.toContain(row.id);
  });
});
