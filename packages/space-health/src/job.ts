import { computeHealthStatus, computeSuggestions } from './health';
import type { SpaceHealthRepository } from './repository';

export interface SpaceHealthJobResult {
  processedSpaceIds: string[];
}

/**
 * The daily job's actual work, decoupled from BullMQ itself so it's
 * directly unit-testable (services/worker's own worker.ts just calls this
 * from inside a BullMQ processor function). Idempotent by construction:
 * `upsertSnapshot` always replaces the one row per space rather than
 * inserting a new one, so running this twice in the same day (a retried or
 * manually re-triggered job) leaves the same final state, not duplicate
 * snapshots - "job روزانهٔ idempotent".
 */
export async function runSpaceHealthJob(repo: SpaceHealthRepository, now: () => Date = () => new Date()): Promise<SpaceHealthJobResult> {
  const spaceIds = await repo.listPublishedSpaceIds();
  const processedSpaceIds: string[] = [];

  for (const spaceId of spaceIds) {
    const signals = await repo.gatherSignals(spaceId);
    const status = computeHealthStatus(signals, now());
    const suggestions = computeSuggestions(signals, status);
    await repo.upsertSnapshot(spaceId, status, signals, suggestions);
    processedSpaceIds.push(spaceId);
  }

  return { processedSpaceIds };
}
