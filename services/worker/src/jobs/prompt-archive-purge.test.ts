import { describe, expect, it } from 'vitest';
import {
  PROMPT_TEXT_RETENTION_DAYS,
  runPromptArchivePurge,
  type PromptArchivePurgeRepository,
} from './prompt-archive-purge';

const NOW = new Date('2026-12-01T03:00:00.000Z');

/** A stand-in for the two `updateMany` calls, so the window itself is testable without Postgres. */
function fakeRepo() {
  const calls: { table: 'archive' | 'attempts'; before: Date; purgedAt: Date }[] = [];
  const repo: PromptArchivePurgeRepository = {
    async purgePromptArchive(before, purgedAt) {
      calls.push({ table: 'archive', before, purgedAt });
      return 3;
    },
    async purgeBuildAttempts(before, purgedAt) {
      calls.push({ table: 'attempts', before, purgedAt });
      return 2;
    },
  };
  return { repo, calls };
}

describe('runPromptArchivePurge', () => {
  it('clears text older than the retention window and nothing newer', async () => {
    const { repo, calls } = fakeRepo();

    const result = await runPromptArchivePurge(repo, NOW);

    const expected = new Date(NOW.getTime() - PROMPT_TEXT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    expect(result.cutoff).toEqual(expected);
    for (const call of calls) expect(call.before).toEqual(expected);
  });

  it('clears both archives, because a prompt is written to two places', async () => {
    // The general AI archive and the space-specific one hold the same words
    // for different reasons; expiring one and not the other would leave the
    // text behind while claiming it was purged.
    const { repo, calls } = fakeRepo();

    const result = await runPromptArchivePurge(repo, NOW);

    expect(calls.map((c) => c.table)).toEqual(['archive', 'attempts']);
    expect(result).toMatchObject({ archiveRows: 3, attemptRows: 2 });
  });

  it('stamps the rows with the moment they were purged, not the cutoff', async () => {
    // textPurgedAt answers "when did we clear this", which is an audit fact
    // about us; the cutoff is a fact about the row.
    const { repo, calls } = fakeRepo();

    await runPromptArchivePurge(repo, NOW);

    for (const call of calls) expect(call.purgedAt).toEqual(NOW);
  });

  it('keeps ninety days, the window the owner chose', async () => {
    expect(PROMPT_TEXT_RETENTION_DAYS).toBe(90);
  });
});
