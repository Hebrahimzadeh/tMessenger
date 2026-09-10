import type { AwarenessEventType, PrismaClient } from '@taavon/database';
import type { DailyAggregateCounts } from './aggregation';

const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export interface AwarenessDailyAggregateRecord extends DailyAggregateCounts {
  date: Date;
  computedAt: Date;
}

export interface AwarenessAggregationRepository {
  /** Every event's type created on the given UTC calendar day - the job's own input to `aggregateDay`. Never returns actor/subject ids. */
  listEventTypesForDay(date: Date): Promise<Array<{ type: AwarenessEventType }>>;
  /** Idempotent (upsert, keyed by the unique `date` column) - recomputing the same day twice replaces the one row, never creates a second. */
  upsertDailyAggregate(date: Date, counts: DailyAggregateCounts): Promise<void>;
  getDailyAggregate(date: Date): Promise<AwarenessDailyAggregateRecord | null>;
  listRecentAggregates(limit: number): Promise<AwarenessDailyAggregateRecord[]>;
}

function toRecord(row: {
  date: Date;
  producedCount: number;
  meaningfulViewCount: number;
  publicContributionCount: number;
  appliedCount: number;
  privateChatStartedCount: number;
  reservationClosedCount: number;
  computedAt: Date;
}): AwarenessDailyAggregateRecord {
  return {
    date: row.date,
    producedCount: row.producedCount,
    meaningfulViewCount: row.meaningfulViewCount,
    publicContributionCount: row.publicContributionCount,
    appliedCount: row.appliedCount,
    privateChatStartedCount: row.privateChatStartedCount,
    reservationClosedCount: row.reservationClosedCount,
    computedAt: row.computedAt,
  };
}

export function createPrismaAwarenessAggregationRepository(prisma: PrismaClient): AwarenessAggregationRepository {
  return {
    async listEventTypesForDay(date) {
      const start = startOfUtcDay(date);
      const end = new Date(start.getTime() + DAY_MS);
      return prisma.awarenessEvent.findMany({ where: { createdAt: { gte: start, lt: end } }, select: { type: true } });
    },

    async upsertDailyAggregate(date, counts) {
      const day = startOfUtcDay(date);
      await prisma.awarenessDailyAggregate.upsert({
        where: { date: day },
        create: { date: day, ...counts },
        update: { ...counts, computedAt: new Date() },
      });
    },

    async getDailyAggregate(date) {
      const day = startOfUtcDay(date);
      const row = await prisma.awarenessDailyAggregate.findUnique({ where: { date: day } });
      return row ? toRecord(row) : null;
    },

    async listRecentAggregates(limit) {
      const rows = await prisma.awarenessDailyAggregate.findMany({ orderBy: { date: 'desc' }, take: limit });
      return rows.map(toRecord);
    },
  };
}
