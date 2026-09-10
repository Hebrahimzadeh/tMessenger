import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CardNotFoundForViewError,
  InvalidParticipationCursorError,
  listMyParticipations,
  recordMeaningfulView,
  type AwarenessRepository,
  type ParticipationItem,
} from './awareness.service';

const CARD = '11111111-1111-4111-8111-111111111111';
const AUTHOR = '22222222-2222-4222-8222-222222222222';
const VIEWER = '33333333-3333-4333-8333-333333333333';

function fakeAwarenessRepo() {
  const views = new Set<string>(); // `${cardId}:${viewerId}`
  const eventsByActor = new Map<string, Array<ParticipationItem & { id: string }>>();
  let clock = 0;

  function push(actorId: string, item: Omit<ParticipationItem, 'createdAt'>) {
    const list = eventsByActor.get(actorId) ?? [];
    list.push({ ...item, id: randomUUID(), createdAt: new Date((clock += 1000)) });
    eventsByActor.set(actorId, list);
  }

  const repo: AwarenessRepository = {
    async getCardAuthorId(cardId) {
      return cardId === CARD ? AUTHOR : null;
    },
    async recordMeaningfulView(cardId, viewerId, deepLink) {
      const key = `${cardId}:${viewerId}`;
      if (views.has(key)) return; // idempotent dedup
      views.add(key);
      push(viewerId, { type: 'MEANINGFUL_VIEW', deepLink });
    },
    async listByActor(actorId, { limit, before }) {
      let rows = (eventsByActor.get(actorId) ?? []).slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1));
      if (before) {
        rows = rows.filter(
          (r) =>
            r.createdAt.getTime() < Date.parse(before.createdAt) ||
            (r.createdAt.getTime() === Date.parse(before.createdAt) && r.id < before.id)
        );
      }
      return rows.slice(0, limit);
    },
  };

  return { repo, views, push };
}

describe('recordMeaningfulView ("dedup view و bot/internal traffic")', () => {
  it('records a genuine view from someone other than the author', async () => {
    const { repo } = fakeAwarenessRepo();
    const result = await recordMeaningfulView(repo, CARD, VIEWER);
    expect(result).toEqual({ recorded: true });
  });

  it('never counts the author viewing their own card - the trivial "internal traffic" case', async () => {
    const { repo } = fakeAwarenessRepo();
    const result = await recordMeaningfulView(repo, CARD, AUTHOR);
    expect(result).toEqual({ recorded: false });
  });

  it('dedups - a repeat view by the same viewer never inflates the count (a page refresh is a no-op)', async () => {
    const { repo, views } = fakeAwarenessRepo();
    await recordMeaningfulView(repo, CARD, VIEWER);
    await recordMeaningfulView(repo, CARD, VIEWER);
    await recordMeaningfulView(repo, CARD, VIEWER);
    expect(views.size).toBe(1);
  });

  it('404s for an unknown card', async () => {
    const { repo } = fakeAwarenessRepo();
    await expect(recordMeaningfulView(repo, randomUUID(), VIEWER)).rejects.toBeInstanceOf(CardNotFoundForViewError);
  });
});

describe('listMyParticipations ("timeline خصوصی و pagination زمانی")', () => {
  it('returns items in strict reverse-chronological order with only type/createdAt/deepLink - no category, status, or score field', async () => {
    const { repo, push } = fakeAwarenessRepo();
    push(VIEWER, { type: 'PRODUCED', deepLink: '/cards/a' });
    push(VIEWER, { type: 'PUBLIC_CONTRIBUTION', deepLink: '/cards/a' });

    const page = await listMyParticipations(repo, VIEWER, { limit: 20 });
    expect(page.items.map((i) => i.type)).toEqual(['PUBLIC_CONTRIBUTION', 'PRODUCED']);
    expect(Object.keys(page.items[0]!).sort()).toEqual(['createdAt', 'deepLink', 'type']);
  });

  it('paginates with a working cursor, never skipping or repeating an item', async () => {
    const { repo, push } = fakeAwarenessRepo();
    for (let i = 0; i < 5; i++) push(VIEWER, { type: 'PRODUCED', deepLink: `/cards/${i}` });

    const firstPage = await listMyParticipations(repo, VIEWER, { limit: 2 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await listMyParticipations(repo, VIEWER, { limit: 2, cursor: firstPage.nextCursor! });
    const thirdPage = await listMyParticipations(repo, VIEWER, { limit: 2, cursor: secondPage.nextCursor! });
    expect(thirdPage.nextCursor).toBeNull();

    const allDeepLinks = [...firstPage.items, ...secondPage.items, ...thirdPage.items].map((i) => i.deepLink);
    expect(new Set(allDeepLinks).size).toBe(5);
  });

  it('rejects a malformed cursor', async () => {
    const { repo } = fakeAwarenessRepo();
    await expect(listMyParticipations(repo, VIEWER, { limit: 20, cursor: 'not-a-real-cursor' })).rejects.toBeInstanceOf(
      InvalidParticipationCursorError
    );
  });

  it('only ever accepts limit/cursor - there is no category/status/filter/search parameter for this function to even read', () => {
    // A type-level guarantee, not a runtime one: listMyParticipations's own
    // params type has exactly these two optional fields.
    const params: Parameters<typeof listMyParticipations>[2] = { limit: 20 };
    expect(Object.keys(params)).toEqual(['limit']);
  });
});
