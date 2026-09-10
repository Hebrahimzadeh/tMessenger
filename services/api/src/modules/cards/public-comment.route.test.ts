import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { describe, expect, it } from 'vitest';
import type { CardStatus, SpaceStatus } from '@taavon/database';
import type { CardReactionType } from '@taavon/contracts';
import { ZodError } from 'zod';
import { apiError } from '../../lib/api-error';
import { ACCESS_TOKEN_COOKIE, signAccessToken } from '../auth/session-tokens';
import { createFakeRateLimiter } from '../auth/rate-limiter';
import { publicCommentRoutes } from './public-comment.route';
import type { CommentRecord, CommentRepository } from './public-comment.service';
import type { ReactionRepository } from './reaction.service';
import type { PinnedCardRecord, PinRepository } from './pin.service';

const SESSION_HMAC_KEY = 'test-only-session-hmac-key';
const CARD = randomUUID();
const AUTHOR = '11111111-1111-4111-8111-111111111111';
const STRANGER = '33333333-3333-4333-8333-333333333333';
const MODERATOR = '44444444-4444-4444-8444-444444444444';
const SPACE = randomUUID();

function fakeCommentRepo(opts: { cardStatus?: CardStatus; spaceStatus?: SpaceStatus; validCardIds?: string[] } = {}): CommentRepository {
  const cardStatus: CardStatus = opts.cardStatus ?? 'ACTIVE';
  const spaceStatus: SpaceStatus = opts.spaceStatus ?? 'PUBLISHED';
  const validCardIds = new Set(opts.validCardIds ?? [CARD]);
  const comments = new Map<string, CommentRecord>();
  let clock = 0;

  return {
    async getCardContext(cardId) {
      return validCardIds.has(cardId) ? { cardStatus, spaceStatus, spaceId: SPACE } : null;
    },
    async isSpaceEditor(userId) {
      return userId === MODERATOR;
    },
    async findComment(commentId) {
      return comments.get(commentId) ?? null;
    },
    async createComment({ cardId, authorId, parentId, body }) {
      const record: CommentRecord = {
        id: randomUUID(),
        cardId,
        authorId,
        parentId,
        status: 'VISIBLE',
        latestBody: body,
        revisionCount: 1,
        createdAt: new Date((clock += 1000)),
        updatedAt: new Date(clock),
      };
      comments.set(record.id, record);
      return record;
    },
    async addRevision({ commentId, body }) {
      const c = comments.get(commentId)!;
      c.latestBody = body;
      c.revisionCount += 1;
      return c;
    },
    async softDelete({ commentId }) {
      comments.get(commentId)!.status = 'DELETED';
    },
    async listByCard(cardId, { limit }) {
      return [...comments.values()].filter((c) => c.cardId === cardId).slice(0, limit);
    },
  };
}

function fakeReactionRepo(opts: { cardStatus?: CardStatus; spaceStatus?: SpaceStatus } = {}): ReactionRepository {
  const cardStatus: CardStatus = opts.cardStatus ?? 'ACTIVE';
  const spaceStatus: SpaceStatus = opts.spaceStatus ?? 'PUBLISHED';
  const reactions = new Set<string>();

  return {
    async getCardContext(cardId) {
      return cardId === CARD ? { cardStatus, spaceStatus } : null;
    },
    async toggle(cardId, userId, type) {
      const key = `${cardId}:${userId}:${type}`;
      if (reactions.has(key)) {
        reactions.delete(key);
        return 'removed';
      }
      reactions.add(key);
      return 'added';
    },
    async summary(cardId, userId) {
      const counts = { SUPPORT: 0, USEFUL: 0, INTERESTED: 0, CELEBRATE: 0 };
      const mine: CardReactionType[] = [];
      for (const key of reactions) {
        const [kCard, kUser, kType] = key.split(':') as [string, string, CardReactionType];
        if (kCard !== cardId) continue;
        counts[kType] += 1;
        if (userId === kUser) mine.push(kType);
      }
      return { counts, mine };
    },
  };
}

function fakePinRepo(): PinRepository {
  const pins = new Map<string, PinnedCardRecord>();
  return {
    async getCardContext(cardId) {
      return cardId === CARD ? { spaceId: SPACE, cardStatus: 'ACTIVE', spaceStatus: 'PUBLISHED' } : null;
    },
    async isSpaceEditor(userId) {
      return userId === AUTHOR;
    },
    async countPins() {
      return pins.size;
    },
    async isPinned(cardId) {
      return pins.has(cardId);
    },
    async pin({ cardId, position }) {
      pins.set(cardId, { cardId, position, title: 'کارت', pinnedAt: new Date() });
    },
    async unpin({ cardId }) {
      return pins.delete(cardId);
    },
    async list() {
      return [...pins.values()];
    },
  };
}

function buildApp(overrides: {
  commentRepository?: CommentRepository;
  reactionRepository?: ReactionRepository;
  pinRepository?: PinRepository;
}) {
  const app = Fastify();
  app.register(cookie);
  app.setErrorHandler((err, request, reply) => {
    if (err instanceof ZodError) {
      reply.code(400).send(apiError(request, 'VALIDATION_ERROR', 'داده ارسالی معتبر نیست.', err.issues));
      return;
    }
    reply.send(err);
  });
  app.register(publicCommentRoutes, {
    prefix: '/v1',
    sessionHmacKey: SESSION_HMAC_KEY,
    commentRepository: overrides.commentRepository ?? fakeCommentRepo(),
    reactionRepository: overrides.reactionRepository ?? fakeReactionRepo(),
    pinRepository: overrides.pinRepository ?? fakePinRepo(),
    reactionRateLimiter: createFakeRateLimiter(100, 60),
  });
  return app;
}

function cookieFor(userId: string) {
  return { [ACCESS_TOKEN_COOKIE]: signAccessToken(userId, SESSION_HMAC_KEY) };
}

describe('comments over HTTP', () => {
  it('requires a session to post, allows anonymous reads, and supports reply/edit/delete', async () => {
    const app = buildApp({});

    const unauth = await app.inject({ method: 'POST', url: `/v1/cards/${CARD}/comments`, payload: { body: 'x' } });
    expect(unauth.statusCode).toBe(401);

    const created = await app.inject({
      method: 'POST',
      url: `/v1/cards/${CARD}/comments`,
      cookies: cookieFor(AUTHOR),
      payload: { body: 'اولین نظر' },
    });
    expect(created.statusCode).toBe(201);
    const commentId = created.json().id as string;

    const reply = await app.inject({
      method: 'POST',
      url: `/v1/cards/${CARD}/comments`,
      cookies: cookieFor(STRANGER),
      payload: { body: 'پاسخ', parentId: commentId },
    });
    expect(reply.statusCode).toBe(201);
    expect(reply.json().parentId).toBe(commentId);

    const list = await app.inject({ method: 'GET', url: `/v1/cards/${CARD}/comments` });
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toHaveLength(2);

    const edited = await app.inject({
      method: 'PATCH',
      url: `/v1/comments/${commentId}`,
      cookies: cookieFor(AUTHOR),
      payload: { body: 'ویرایش‌شده' },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().body).toBe('ویرایش‌شده');

    const forbiddenDelete = await app.inject({ method: 'DELETE', url: `/v1/comments/${commentId}`, cookies: cookieFor(STRANGER) });
    expect(forbiddenDelete.statusCode).toBe(403);

    const deleted = await app.inject({ method: 'DELETE', url: `/v1/comments/${commentId}`, cookies: cookieFor(AUTHOR) });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json().body).toBeNull();

    await app.close();
  });

  it('rejects a reply targeting a comment on a different (but real) card, and a too-long body', async () => {
    const otherCard = randomUUID();
    const app = buildApp({ commentRepository: fakeCommentRepo({ validCardIds: [CARD, otherCard] }) });
    const created = await app.inject({
      method: 'POST',
      url: `/v1/cards/${CARD}/comments`,
      cookies: cookieFor(AUTHOR),
      payload: { body: 'x' },
    });
    const crossReply = await app.inject({
      method: 'POST',
      url: `/v1/cards/${otherCard}/comments`,
      cookies: cookieFor(STRANGER),
      payload: { body: 'y', parentId: created.json().id },
    });
    expect(crossReply.statusCode).toBe(422);
    expect(crossReply.json().error.code).toBe('CROSS_CARD_REPLY');

    const tooLong = await app.inject({
      method: 'POST',
      url: `/v1/cards/${CARD}/comments`,
      cookies: cookieFor(AUTHOR),
      payload: { body: 'a'.repeat(4001) },
    });
    expect(tooLong.statusCode).toBe(400);

    await app.close();
  });
});

describe('reactions over HTTP', () => {
  it('toggles idempotently and rate-limits', async () => {
    const limitedApp = Fastify();
    limitedApp.register(cookie);
    limitedApp.register(publicCommentRoutes, {
      prefix: '/v1',
      sessionHmacKey: SESSION_HMAC_KEY,
      reactionRepository: fakeReactionRepo(),
      reactionRateLimiter: createFakeRateLimiter(1, 60),
    });

    const first = await limitedApp.inject({
      method: 'POST',
      url: `/v1/cards/${CARD}/reactions`,
      cookies: cookieFor(AUTHOR),
      payload: { type: 'SUPPORT' },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().counts.SUPPORT).toBe(1);

    const rateLimited = await limitedApp.inject({
      method: 'POST',
      url: `/v1/cards/${CARD}/reactions`,
      cookies: cookieFor(AUTHOR),
      payload: { type: 'USEFUL' },
    });
    expect(rateLimited.statusCode).toBe(429);

    await limitedApp.close();
  });

  it('GET reflects the current summary for an anonymous caller', async () => {
    const app = buildApp({});
    await app.inject({ method: 'POST', url: `/v1/cards/${CARD}/reactions`, cookies: cookieFor(AUTHOR), payload: { type: 'CELEBRATE' } });
    const summary = await app.inject({ method: 'GET', url: `/v1/cards/${CARD}/reactions` });
    expect(summary.json().counts.CELEBRATE).toBe(1);
    expect(summary.json().mine).toEqual([]);
    await app.close();
  });
});

describe('pins over HTTP', () => {
  it('pins, lists, and unpins; refuses a non-owner', async () => {
    const app = buildApp({});

    const forbidden = await app.inject({ method: 'POST', url: `/v1/cards/${CARD}/pin`, cookies: cookieFor(STRANGER) });
    expect(forbidden.statusCode).toBe(403);

    const pinned = await app.inject({ method: 'POST', url: `/v1/cards/${CARD}/pin`, cookies: cookieFor(AUTHOR) });
    expect(pinned.statusCode).toBe(200);
    expect(pinned.json().items).toHaveLength(1);

    const list = await app.inject({ method: 'GET', url: `/v1/spaces/${SPACE}/pins` });
    expect(list.json().items).toHaveLength(1);

    const unpinned = await app.inject({ method: 'DELETE', url: `/v1/cards/${CARD}/pin`, cookies: cookieFor(AUTHOR) });
    expect(unpinned.json().items).toHaveLength(0);

    await app.close();
  });
});
