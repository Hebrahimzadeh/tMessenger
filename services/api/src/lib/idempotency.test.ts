import { describe, expect, it, vi } from 'vitest';
import { withIdempotency, type IdempotencyRepository } from './idempotency';

function fakeIdempotencyRepo(): IdempotencyRepository {
  const store = new Map<string, { responseStatus: number; responseBody: unknown }>();
  return {
    async find(scope, actorId, key) {
      return store.get(`${scope}:${actorId}:${key}`) ?? null;
    },
    async save(scope, actorId, key, responseStatus, responseBody) {
      store.set(`${scope}:${actorId}:${key}`, { responseStatus, responseBody });
    },
  };
}

describe('withIdempotency', () => {
  it('runs fn once for a new key and caches a successful result', async () => {
    const repo = fakeIdempotencyRepo();
    const fn = vi.fn().mockResolvedValue({ status: 200, body: { ok: true } });

    const result = await withIdempotency(repo, 'reservation:reserve', 'user-1', 'key-1', fn);
    expect(result).toEqual({ status: 200, body: { ok: true }, replayed: false });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('replays the cached response on a repeat call with the same key, without calling fn again', async () => {
    const repo = fakeIdempotencyRepo();
    const fn = vi.fn().mockResolvedValue({ status: 201, body: { reservationId: 'r1' } });

    await withIdempotency(repo, 'reservation:reserve', 'user-1', 'key-1', fn);
    const replayed = await withIdempotency(repo, 'reservation:reserve', 'user-1', 'key-1', fn);

    expect(replayed).toEqual({ status: 201, body: { reservationId: 'r1' }, replayed: true });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed result, so a retry under the same key runs fn again', async () => {
    const repo = fakeIdempotencyRepo();
    const fn = vi.fn().mockResolvedValue({ status: 422, body: { error: 'nope' } });

    await withIdempotency(repo, 'reservation:reserve', 'user-1', 'key-1', fn);
    await withIdempotency(repo, 'reservation:reserve', 'user-1', 'key-1', fn);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('scopes by actor - the same literal key from a different user runs fn independently', async () => {
    const repo = fakeIdempotencyRepo();
    const fn = vi.fn().mockResolvedValue({ status: 200, body: {} });

    await withIdempotency(repo, 'reservation:reserve', 'user-1', 'shared-key', fn);
    await withIdempotency(repo, 'reservation:reserve', 'user-2', 'shared-key', fn);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('scopes by action - the same key under a different scope runs fn independently', async () => {
    const repo = fakeIdempotencyRepo();
    const fn = vi.fn().mockResolvedValue({ status: 200, body: {} });

    await withIdempotency(repo, 'reservation:reserve', 'user-1', 'shared-key', fn);
    await withIdempotency(repo, 'reservation:cancel', 'user-1', 'shared-key', fn);

    expect(fn).toHaveBeenCalledTimes(2);
  });
});
