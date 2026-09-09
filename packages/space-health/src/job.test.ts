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
