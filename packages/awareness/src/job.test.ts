import { describe, expect, it } from 'vitest';
import type { AwarenessAggregationRepository } from './repository';
import { runAwarenessAggregationJob } from './job';

function fakeRepo(eventsByDay: Map<string, Array<{ type: string }>>) {
  const upserts: Array<{ date: Date; counts: unknown }> = [];
  const repo: AwarenessAggregationRepository = {
    async listEventTypesForDay(date) {
      const key = date.toISOString().slice(0, 10);
      return (eventsByDay.get(key) ?? []) as never;
    },
    async upsertDailyAggregate(date, counts) {
      upserts.push({ date, counts });
    },
    async getDailyAggregate() {
      return null;
    },
    async listRecentAggregates() {
      return [];
    },
  };
  return { repo, upserts };
}

describe('runAwarenessAggregationJob', () => {
  it('aggregates yesterday (not today, which is still in progress) and upserts it', async () => {
    const now = new Date('2031-03-16T04:00:00.000Z');
    const yesterdayKey = '2031-03-15';
    const { repo, upserts } = fakeRepo(new Map([[yesterdayKey, [{ type: 'PRODUCED' }, { type: 'PRODUCED' }]]]));

    const result = await runAwarenessAggregationJob(repo, now);

    expect(result.date).toBe(yesterdayKey);
    expect(result.counts.producedCount).toBe(2);
    expect(upserts).toHaveLength(1);
  });

  it('is idempotent - running it twice for the same "now" upserts the same day twice, not two different days', async () => {
    const now = new Date('2031-03-16T04:00:00.000Z');
    const { repo, upserts } = fakeRepo(new Map());

    await runAwarenessAggregationJob(repo, now);
    await runAwarenessAggregationJob(repo, now);

    expect(upserts).toHaveLength(2);
    expect(upserts[0]!.date.toISOString().slice(0, 10)).toBe(upserts[1]!.date.toISOString().slice(0, 10));
  });
});
