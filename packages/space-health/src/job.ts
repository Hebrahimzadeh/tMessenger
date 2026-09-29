import { computeHealthStatus, computeSuggestions } from './health';
import type { SpaceHealthRepository } from './repository';

export interface SpaceHealthJobResult {
  processedSpaceIds: string[];
  /** Spaces this run could not compute, with why. Empty on a clean run. */
  failures: { spaceId: string; message: string }[];
}

/**
 * The daily job's actual work, decoupled from BullMQ itself so it's
 * directly unit-testable (services/worker's own worker.ts just calls this
 * from inside a BullMQ processor function). Idempotent by construction:
 * `upsertSnapshot` always replaces the one row per space rather than
 * inserting a new one, so running this twice in the same day (a retried or
 * manually re-triggered job) leaves the same final state, not duplicate
 * snapshots - "job روزانهٔ idempotent".
 *
 * One space's failure is not the run's failure. A nightly batch that
 * aborts on the first bad row silently stops refreshing every space after
 * it, and the symptom - stale snapshots - looks nothing like the cause.
 * Found 2026-09-29: a single PUBLISHED space with no `publishedAt` threw
 * inside the health computation and ended the whole pass.
 */
export async function runSpaceHealthJob(repo: SpaceHealthRepository, now: () => Date = () => new Date()): Promise<SpaceHealthJobResult> {
  const spaceIds = await repo.listPublishedSpaceIds();
  const processedSpaceIds: string[] = [];
  const failures: { spaceId: string; message: string }[] = [];

  for (const spaceId of spaceIds) {
    try {
      const signals = await repo.gatherSignals(spaceId);
      const status = computeHealthStatus(signals, now());
      const suggestions = computeSuggestions(signals, status);
      await repo.upsertSnapshot(spaceId, status, signals, suggestions);
      processedSpaceIds.push(spaceId);
    } catch (err) {
      // Collected rather than swallowed: the caller logs these, so a
      // space that stops being computable is visible instead of merely
      // absent from the results.
      failures.push({ spaceId, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return { processedSpaceIds, failures };
}
