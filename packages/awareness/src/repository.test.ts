import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@taavon/database';
import { createPrismaAwarenessAggregationRepository, startOfUtcDay } from './repository';

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

// This package has no dependency on services/api's own repositories (that
// would be a backwards dependency) - events here are written directly with
// raw Prisma calls, same discipline as packages/space-health's own tests.
describe.skipIf(!databaseAvailable)('AwarenessAggregationRepository: real Postgres', () => {
  const repo = createPrismaAwarenessAggregationRepository(getPrisma());
  const TEST_DAY = new Date('2031-03-15T00:00:00.000Z'); // far enough in the future to never collide with real data
  let userId: string;

  beforeAll(async () => {
    userId = (await getPrisma().user.create({ data: {} })).id;
  });

  afterEach(async () => {
    await getPrisma().awarenessEvent.deleteMany({ where: { actorId: userId } });
    await getPrisma().awarenessDailyAggregate.deleteMany({ where: { date: startOfUtcDay(TEST_DAY) } });
  });

  it('listEventTypesForDay returns only events within the UTC calendar day, never actor/subject ids', async () => {
    const subjectId = '11111111-1111-4111-8111-111111111111';
    await getPrisma().awarenessEvent.create({
      data: {
        type: 'PRODUCED',
        actorId: userId,
        subjectId,
        idempotencyKey: 'repo-test-in-day',
        createdAt: new Date(TEST_DAY.getTime() + 12 * 60 * 60 * 1000), // noon that day
      },
    });
    await getPrisma().awarenessEvent.create({
      data: {
        type: 'PRODUCED',
        actorId: userId,
        subjectId,
        idempotencyKey: 'repo-test-next-day',
        createdAt: new Date(TEST_DAY.getTime() + 25 * 60 * 60 * 1000), // next day
      },
    });

    const events = await repo.listEventTypesForDay(TEST_DAY);
    expect(events).toEqual([{ type: 'PRODUCED' }]);
  });

  it('upsertDailyAggregate is idempotent - recomputing the same day replaces the one row', async () => {
    await repo.upsertDailyAggregate(TEST_DAY, {
      producedCount: 1,
      meaningfulViewCount: 0,
      publicContributionCount: 0,
      appliedCount: 0,
      privateChatStartedCount: 0,
      reservationClosedCount: 0,
    });
    await repo.upsertDailyAggregate(TEST_DAY, {
      producedCount: 5,
      meaningfulViewCount: 2,
      publicContributionCount: 0,
      appliedCount: 0,
      privateChatStartedCount: 0,
      reservationClosedCount: 0,
    });

    const count = await getPrisma().awarenessDailyAggregate.count({ where: { date: startOfUtcDay(TEST_DAY) } });
    expect(count).toBe(1);

    const row = await repo.getDailyAggregate(TEST_DAY);
    expect(row).toMatchObject({ producedCount: 5, meaningfulViewCount: 2 });
  });

  it('the stored row never carries a raw actor/subject id column', async () => {
    await repo.upsertDailyAggregate(TEST_DAY, {
      producedCount: 1,
      meaningfulViewCount: 0,
      publicContributionCount: 0,
      appliedCount: 0,
      privateChatStartedCount: 0,
      reservationClosedCount: 0,
    });
    const raw = await getPrisma().awarenessDailyAggregate.findUniqueOrThrow({ where: { date: startOfUtcDay(TEST_DAY) } });
    expect(Object.keys(raw)).not.toContain('actorId');
    expect(Object.keys(raw)).not.toContain('subjectId');
  });
});
