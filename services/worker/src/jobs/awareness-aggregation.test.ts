import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@taavon/database';
import { startOfUtcDay } from '@taavon/awareness';
import { processAwarenessAggregationJob } from './awareness-aggregation';

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

describe.skipIf(!databaseAvailable)('processAwarenessAggregationJob: real Postgres', () => {
  let userId: string;
  // "now" for the job is a fixed instant, so "yesterday" always resolves to this same test day regardless of when the suite actually runs.
  const NOW = new Date('2031-04-02T04:00:00.000Z');
  const YESTERDAY = new Date('2031-04-01T00:00:00.000Z');

  beforeAll(async () => {
    userId = (await getPrisma().user.create({ data: {} })).id;
  });

  afterEach(async () => {
    await getPrisma().awarenessEvent.deleteMany({ where: { actorId: userId } });
    await getPrisma().awarenessDailyAggregate.deleteMany({ where: { date: startOfUtcDay(YESTERDAY) } });
  });

  it('aggregates real events from yesterday into a real stored row', async () => {
    await getPrisma().awarenessEvent.create({
      data: {
        type: 'PRODUCED',
        actorId: userId,
        subjectId: '11111111-1111-4111-8111-111111111111',
        idempotencyKey: 'worker-awareness-test-1',
        createdAt: new Date(YESTERDAY.getTime() + 60 * 60 * 1000),
      },
    });

    const result = await processAwarenessAggregationJob(getPrisma(), NOW);
    expect(result.counts.producedCount).toBe(1);

    const row = await getPrisma().awarenessDailyAggregate.findUnique({ where: { date: startOfUtcDay(YESTERDAY) } });
    expect(row).toMatchObject({ producedCount: 1 });
  });

  it('running it twice is idempotent - one row per day, not two', async () => {
    await processAwarenessAggregationJob(getPrisma(), NOW);
    await processAwarenessAggregationJob(getPrisma(), NOW);

    const count = await getPrisma().awarenessDailyAggregate.count({ where: { date: startOfUtcDay(YESTERDAY) } });
    expect(count).toBe(1);
  });
});
