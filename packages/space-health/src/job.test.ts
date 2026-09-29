import { describe, expect, it, vi } from 'vitest';
import { runSpaceHealthJob } from './job';
import type { HealthSignals, HealthSuggestion } from './health';
import type { SpaceHealthRepository } from './repository';

function fakeRepo(signalsBySpace: Record<string, HealthSignals>, spaceIds: string[]): SpaceHealthRepository & {
  upserts: Array<{ spaceId: string; status: string; suggestions: HealthSuggestion[] }>;
} {
  const upserts: Array<{ spaceId: string; status: string; suggestions: HealthSuggestion[] }> = [];
  return {
    upserts,
    listPublishedSpaceIds: vi.fn().mockResolvedValue(spaceIds),
    gatherSignals: vi.fn().mockImplementation(async (spaceId: string) => signalsBySpace[spaceId]!),
    upsertSnapshot: vi.fn().mockImplementation(async (spaceId: string, status, _signals, suggestions) => {
      upserts.push({ spaceId, status, suggestions });
    }),
    getSnapshot: vi.fn(),
  };
}

const PUBLISHED_AT = new Date('2026-01-01T00:00:00Z');

describe('runSpaceHealthJob', () => {
  it('processes every published space and upserts a snapshot for each', async () => {
    const signals: HealthSignals = {
      publishedAt: PUBLISHED_AT,
      lastActivityAt: PUBLISHED_AT,
      contributorCount: 3,
      totalRoleCount: 2,
      activeRoleCount: 2,
      cardCount: 0,
    };
    const repo = fakeRepo({ 'space-1': signals, 'space-2': signals }, ['space-1', 'space-2']);

    const now = () => new Date(PUBLISHED_AT.getTime() + 10 * 24 * 60 * 60 * 1000);
    const result = await runSpaceHealthJob(repo, now);

    expect(result.processedSpaceIds).toEqual(['space-1', 'space-2']);
    expect(repo.upserts).toHaveLength(2);
    expect(repo.upserts[0]?.status).toBe('ACTIVE');
  });

  it('is idempotent - running it twice produces the same final snapshot per space, not duplicates', async () => {
    const signals: HealthSignals = {
      publishedAt: PUBLISHED_AT,
      lastActivityAt: null,
      contributorCount: 0,
      totalRoleCount: 2,
      activeRoleCount: 0,
      cardCount: 0,
    };
    const repo = fakeRepo({ 'space-1': signals }, ['space-1']);
    const now = () => new Date(PUBLISHED_AT.getTime() + 45 * 24 * 60 * 60 * 1000);

    await runSpaceHealthJob(repo, now);
    await runSpaceHealthJob(repo, now);

    // upsertSnapshot itself is what guarantees idempotency at the DB level
    // (see repository.test.ts) - here we confirm the job calls it exactly
    // once per space per run, with the same deterministic result both times.
    expect(repo.upserts).toHaveLength(2);
    expect(repo.upserts[0]?.status).toBe(repo.upserts[1]?.status);
    expect(repo.upserts[0]?.suggestions).toEqual(repo.upserts[1]?.suggestions);
  });

  it('does nothing when there are no published spaces', async () => {
    const repo = fakeRepo({}, []);
    const result = await runSpaceHealthJob(repo);
    expect(result.processedSpaceIds).toEqual([]);
    expect(repo.upserts).toHaveLength(0);
  });
});

describe('runSpaceHealthJob: one bad space is not a bad run', () => {
  const SIGNALS: HealthSignals = {
    publishedAt: PUBLISHED_AT,
    lastActivityAt: PUBLISHED_AT,
    contributorCount: 3,
    totalRoleCount: 2,
    activeRoleCount: 2,
    cardCount: 0,
  };

  /** Throws for one named space and behaves for the rest. */
  function repoFailingOn(badSpaceId: string, spaceIds: string[]): SpaceHealthRepository & { upserts: string[] } {
    const upserts: string[] = [];
    return {
      upserts,
      async listPublishedSpaceIds() {
        return spaceIds;
      },
      async gatherSignals(spaceId) {
        if (spaceId === badSpaceId) throw new Error(`space ${spaceId} is PUBLISHED but has no publishedAt`);
        return SIGNALS;
      },
      async upsertSnapshot(spaceId) {
        upserts.push(spaceId);
      },
      async getSnapshot() {
        return null;
      },
    };
  }

  it('carries on past a space it cannot compute, and still does all the others', async () => {
    // Found 2026-09-29: one PUBLISHED row with no publishedAt threw inside
    // the health computation and ended the pass, so every space after it
    // silently kept a stale snapshot.
    const repo = repoFailingOn('bad', ['a', 'bad', 'b', 'c']);

    const result = await runSpaceHealthJob(repo);

    expect(result.processedSpaceIds).toEqual(['a', 'b', 'c']);
    expect(repo.upserts).toEqual(['a', 'b', 'c']);
  });

  it('reports what it could not do, rather than leaving it merely absent', async () => {
    const repo = repoFailingOn('bad', ['a', 'bad']);

    const result = await runSpaceHealthJob(repo);

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.spaceId).toBe('bad');
    expect(result.failures[0]!.message).toContain('publishedAt');
  });

  it('reports no failures on a clean run', async () => {
    const repo = repoFailingOn('nobody', ['a', 'b']);
    const result = await runSpaceHealthJob(repo);
    expect(result.failures).toEqual([]);
  });
});
