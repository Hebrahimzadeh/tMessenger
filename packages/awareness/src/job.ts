import { aggregateDay, type DailyAggregateCounts } from './aggregation';
import type { AwarenessAggregationRepository } from './repository';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AwarenessAggregationJobResult {
  date: string;
  counts: DailyAggregateCounts;
}

function yesterday(now: Date): Date {
  return new Date(now.getTime() - DAY_MS);
}

/**
 * The daily aggregation job (services/worker's own scheduler calls this,
 * mirroring packages/space-health's `runSpaceHealthJob`). Defaults to
 * *yesterday* - "today" is still accumulating events when this typically
 * runs (03:xx server time), so aggregating it now would produce a
 * permanently-incomplete row; a re-run for the same day is a safe upsert
 * either way.
 */
export async function runAwarenessAggregationJob(
  repo: AwarenessAggregationRepository,
  now: Date = new Date()
): Promise<AwarenessAggregationJobResult> {
  const targetDate = yesterday(now);
  const events = await repo.listEventTypesForDay(targetDate);
  const counts = aggregateDay(events);
  await repo.upsertDailyAggregate(targetDate, counts);
  return { date: targetDate.toISOString().slice(0, 10), counts };
}
