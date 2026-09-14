import { describe, expect, it, vi } from 'vitest';
import { runNotificationJob, type NotificationJobRepository } from './job';
import type { AudienceLookup, NotificationIntent, OutboxEventInput } from './derive';

const CARD = '11111111-1111-4111-8111-111111111111';
const AUTHOR = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';

function commentEvent(id: string, commentId: string): OutboxEventInput {
  return {
    id,
    aggregateType: 'Card',
    aggregateId: CARD,
    eventType: 'card.comment_created',
    payload: { cardId: CARD, commentId, authorId: AUTHOR },
  };
}

/** A repository whose state a test can inspect, with a real unique constraint on dedupKey. */
function fakeRepo(events: OutboxEventInput[], over: Partial<NotificationJobRepository> = {}) {
  const created = new Map<string, NotificationIntent>();
  const processed: string[] = [];
  const attempts = new Map<string, number>();
  let pending = [...events];

  const audience: AudienceLookup = {
    publicReplyAudience: async () => [OTHER],
    reservationAudience: async () => [OTHER],
    spaceAudience: async () => [OTHER],
  };

  const repo: NotificationJobRepository = {
    audience,
    async claimUnprocessed(limit) {
      return pending.slice(0, limit);
    },
    async createIfNew(intent) {
      if (created.has(intent.dedupKey)) return false; // the unique index, in miniature
      created.set(intent.dedupKey, intent);
      return true;
    },
    async markProcessed(id) {
      processed.push(id);
      pending = pending.filter((e) => e.id !== id);
    },
    async recordAttempt(id) {
      attempts.set(id, (attempts.get(id) ?? 0) + 1);
    },
    ...over,
  };

  return { repo, created, processed, attempts, reset: (next: OutboxEventInput[]) => (pending = [...next]) };
}

describe('draining the outbox', () => {
  it('creates a notification per event and marks each processed', async () => {
    const { repo, created, processed } = fakeRepo([commentEvent('e1', 'c1'), commentEvent('e2', 'c2')]);

    const result = await runNotificationJob(repo);

    expect(result.created).toBe(2);
    expect(result.processedEventIds).toEqual(['e1', 'e2']);
    expect(created.size).toBe(2);
    expect(processed).toEqual(['e1', 'e2']);
  });

  it('respects the batch limit', async () => {
    const { repo } = fakeRepo([commentEvent('e1', 'c1'), commentEvent('e2', 'c2'), commentEvent('e3', 'c3')]);
    const result = await runNotificationJob(repo, 2);
    expect(result.processedEventIds).toHaveLength(2);
  });

  it('does nothing at all on an empty outbox', async () => {
    const { repo } = fakeRepo([]);
    await expect(runNotificationJob(repo)).resolves.toEqual({ processedEventIds: [], created: 0, deferred: [] });
  });
});

describe('at-least-once, and idempotent', () => {
  it('creates nothing extra when the same event is processed twice', async () => {
    const events = [commentEvent('e1', 'c1')];
    const { repo, created, reset } = fakeRepo(events);

    await runNotificationJob(repo);
    expect(created.size).toBe(1);

    // A crash after creating but before marking processed leaves the row for
    // the next run, which is the whole point of at-least-once.
    reset(events);
    const second = await runNotificationJob(repo);

    expect(second.created).toBe(0);
    expect(created.size).toBe(1);
  });

  it('marks processed only after the notifications exist, so a crash between them loses nothing', async () => {
    const order: string[] = [];
    const { repo } = fakeRepo([commentEvent('e1', 'c1')], {
      async createIfNew() {
        order.push('create');
        return true;
      },
      async markProcessed() {
        order.push('mark');
      },
    });

    await runNotificationJob(repo);
    expect(order).toEqual(['create', 'mark']);
  });

  it('leaves the event unprocessed when creating a notification throws', async () => {
    const { repo, processed, attempts } = fakeRepo([commentEvent('e1', 'c1')], {
      async createIfNew() {
        throw new Error('database went away');
      },
    });

    const result = await runNotificationJob(repo);

    expect(result.deferred).toEqual(['e1']);
    expect(processed).toEqual([]);
    expect(attempts.get('e1')).toBe(1);
  });
});

describe('one bad event does not block the queue', () => {
  it('keeps going past a failure and processes everything else', async () => {
    const createIfNew = vi.fn(async (intent: NotificationIntent) => {
      if (intent.dedupKey.includes('poison')) throw new Error('bad row');
      return true;
    });

    const { repo, processed } = fakeRepo(
      [commentEvent('e1', 'c1'), commentEvent('e2', 'poison'), commentEvent('e3', 'c3')],
      { createIfNew }
    );

    const result = await runNotificationJob(repo);

    // The head of the queue cannot poison everything behind it.
    expect(result.processedEventIds).toEqual(['e1', 'e3']);
    expect(result.deferred).toEqual(['e2']);
    expect(processed).toEqual(['e1', 'e3']);
  });

  it('counts an attempt on the failing event so it can be backed off', async () => {
    const { repo, attempts } = fakeRepo([commentEvent('e1', 'c1')], {
      async createIfNew() {
        throw new Error('nope');
      },
    });

    await runNotificationJob(repo);
    await runNotificationJob(repo);

    expect(attempts.get('e1')).toBe(2);
  });

  it('treats an event nobody subscribes to as done, not as a failure', async () => {
    const { repo, created, processed } = fakeRepo([
      { id: 'e1', aggregateType: 'Space', aggregateId: 's1', eventType: 'space.created', payload: {} },
    ]);

    const result = await runNotificationJob(repo);

    expect(result.deferred).toEqual([]);
    expect(processed).toEqual(['e1']);
    expect(created.size).toBe(0);
  });
});
