import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { describe, expect, it } from 'vitest';
import { awarenessRoutes } from './awareness.route';
import type { AwarenessRepository, ParticipationItem } from './awareness.service';
import { ACCESS_TOKEN_COOKIE, signAccessToken } from '../auth/session-tokens';

const SESSION_HMAC_KEY = 'test-only-session-hmac-key';
const CARD = '11111111-1111-4111-8111-111111111111';
const AUTHOR = '22222222-2222-4222-8222-222222222222';
const VIEWER = '33333333-3333-4333-8333-333333333333';

function fakeRepo(): AwarenessRepository {
  const views = new Set<string>();
  const events: Array<ParticipationItem & { id: string }> = [
    { id: 'e1', type: 'PRODUCED', createdAt: new Date('2026-09-01T00:00:00Z'), deepLink: '/cards/x' },
  ];

  return {
    async getCardAuthorId(cardId) {
      return cardId === CARD ? AUTHOR : null;
    },
    async recordMeaningfulView(cardId, viewerId) {
      views.add(`${cardId}:${viewerId}`);
    },
    async listByActor(actorId) {
      return actorId === VIEWER ? events : [];
    },
  };
}

function buildApp(repo: AwarenessRepository = fakeRepo()) {
  const app = Fastify();
  app.register(cookie);
  app.register(awarenessRoutes, { prefix: '/v1', sessionHmacKey: SESSION_HMAC_KEY, awarenessRepository: repo });
  return app;
}

function cookieFor(userId: string) {
  return { [ACCESS_TOKEN_COOKIE]: signAccessToken(userId, SESSION_HMAC_KEY) };
}

describe('POST /v1/cards/:cardId/views', () => {
  it('requires a session', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: `/v1/cards/${CARD}/views` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('records a genuine viewer and reports recorded:true', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: `/v1/cards/${CARD}/views`, cookies: cookieFor(VIEWER) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ recorded: true });
    await app.close();
  });

  it('reports recorded:false for the author viewing their own card - not an error', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: `/v1/cards/${CARD}/views`, cookies: cookieFor(AUTHOR) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ recorded: false });
    await app.close();
  });

  it('404s for an unknown card', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/v1/cards/99999999-9999-4999-8999-999999999999/views', cookies: cookieFor(VIEWER) });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('GET /v1/me/participations', () => {
  it('requires a session', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/me/participations' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('returns only the caller\'s own timeline, with no way to pass a category/status/filter/search param', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      // Even if a client tries to pass extra params, the route never reads them.
      url: '/v1/me/participations?category=cards&status=open&search=x',
      cookies: cookieFor(VIEWER),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(1);
    expect(Object.keys(body.items[0])).toEqual(['type', 'createdAt', 'deepLink']);
    expect(body).not.toHaveProperty('category');
    expect(body).not.toHaveProperty('score');
  });

  it('returns an empty list for a user with no participation history', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/me/participations', cookies: cookieFor(AUTHOR) });
    expect(res.json()).toEqual({ items: [], nextCursor: null });
    await app.close();
  });
});
