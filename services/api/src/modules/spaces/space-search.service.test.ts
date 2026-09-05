import { describe, expect, it, vi } from 'vitest';
import {
  followSpace,
  FollowingScopeRequiresSessionError,
  InvalidCursorError,
  searchSpaces,
  unfollowSpace,
  type SpaceSearchRepository,
  type SpaceSearchResultRecord,
} from './space-search.service';

function record(overrides: Partial<SpaceSearchResultRecord> = {}): SpaceSearchResultRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'baagh-mahalle',
    title: 'باغ محله',
    purpose: 'نگهداری مشترک',
    followerCount: 3,
    publishedAt: new Date('2026-09-01T00:00:00Z'),
    score: 1,
    ...overrides,
  };
}

function fakeRepo(searchImpl: SpaceSearchRepository['search']): SpaceSearchRepository {
  return {
    search: searchImpl,
    followSpace: vi.fn(),
    unfollowSpace: vi.fn(),
  };
}

describe('searchSpaces', () => {
  it('normalizes the query (trim, lowercase, ي/ك) before calling the repository', async () => {
    const searchSpy = vi.fn().mockResolvedValue([]);
    const repo = fakeRepo(searchSpy);

    await searchSpaces(repo, { query: '  كتاب  ', scope: 'all', userId: null, limit: 20 });

    expect(searchSpy).toHaveBeenCalledWith(expect.objectContaining({ normalizedQuery: 'کتاب' }));
  });

  it('fetches one extra row to detect a next page, without leaking it into the returned items', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => record({ id: `id-${i}` }));
    const repo = fakeRepo(vi.fn().mockResolvedValue(rows));

    const result = await searchSpaces(repo, { scope: 'all', userId: null, limit: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).not.toBeNull();
  });

  it('returns a null cursor when there is no next page', async () => {
    const rows = [record()];
    const repo = fakeRepo(vi.fn().mockResolvedValue(rows));

    const result = await searchSpaces(repo, { scope: 'all', userId: null, limit: 20 });
    expect(result.nextCursor).toBeNull();
  });

  it('never includes the internal ranking score in a returned item', async () => {
    const repo = fakeRepo(vi.fn().mockResolvedValue([record()]));
    const result = await searchSpaces(repo, { scope: 'all', userId: null, limit: 20 });
    expect(result.items[0]).not.toHaveProperty('score');
  });

  it('round-trips a cursor: encoding then decoding recovers the same keyset (proven by passing it back through the same search call)', async () => {
    const searchSpy = vi.fn().mockResolvedValue([record(), record({ id: 'id-2' })]);
    const repo = fakeRepo(searchSpy);

    const first = await searchSpaces(repo, { scope: 'all', userId: null, limit: 1 });
    expect(first.nextCursor).not.toBeNull();

    await searchSpaces(repo, { scope: 'all', userId: null, limit: 1, cursor: first.nextCursor! });
    const secondCallArgs = searchSpy.mock.calls[1]![0];
    expect(secondCallArgs.after).toEqual({
      score: 1,
      followerCount: 3,
      publishedAt: '2026-09-01T00:00:00.000Z',
      id: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('throws InvalidCursorError for a malformed cursor rather than silently ignoring it', async () => {
    const repo = fakeRepo(vi.fn().mockResolvedValue([]));
    await expect(searchSpaces(repo, { scope: 'all', userId: null, limit: 20, cursor: 'not-a-real-cursor' })).rejects.toThrow(
      InvalidCursorError
    );
  });

  it('throws FollowingScopeRequiresSessionError when scope=following has no userId', async () => {
    const repo = fakeRepo(vi.fn().mockResolvedValue([]));
    await expect(searchSpaces(repo, { scope: 'following', userId: null, limit: 20 })).rejects.toThrow(
      FollowingScopeRequiresSessionError
    );
  });
});

describe('followSpace / unfollowSpace', () => {
  it('delegate directly to the repository', async () => {
    const repo = fakeRepo(vi.fn());
    await followSpace(repo, 'space-1', 'user-1');
    await unfollowSpace(repo, 'space-1', 'user-1');
    expect(repo.followSpace).toHaveBeenCalledWith('space-1', 'user-1');
    expect(repo.unfollowSpace).toHaveBeenCalledWith('space-1', 'user-1');
  });
});
