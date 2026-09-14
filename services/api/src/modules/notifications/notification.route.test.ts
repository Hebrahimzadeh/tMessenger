import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { PREVIEW_MAX_CHARS } from '@taavon/contracts';
import { apiError } from '../../lib/api-error';
import { ACCESS_TOKEN_COOKIE, signAccessToken } from '../auth/session-tokens';
import { notificationRoutes } from './notification.route';
import type { NotificationRecord, NotificationRepository } from './notification.service';

const SESSION_HMAC_KEY = 'test-only-session-hmac-key';
const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

function notification(over: Partial<NotificationRecord> = {}): NotificationRecord {
  return {
    id: randomUUID(),
    recipientId: ALICE,
    type: 'NEW_PUBLIC_REPLY',
    subjectType: 'CardComment',
    subjectId: randomUUID(),
    deepLink: '/cards/abc',
    readAt: null,
    createdAt: new Date('2026-09-15T08:00:00.000Z'),
    ...over,
  };
}

/** Scoped exactly the way the Prisma one is: every read and write filters on the recipient. */
function fakeRepo(rows: NotificationRecord[] = [], messageBodies: Record<string, string> = {}) {
  const store = [...rows];
  const prefs = new Map<string, { privateMessagePreview: boolean }>();

  const repo: NotificationRepository = {
    async listForRecipient(recipientId, { limit }) {
      return store
        .filter((n) => n.recipientId === recipientId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit);
    },
    async countUnread(recipientId) {
      return store.filter((n) => n.recipientId === recipientId && n.readAt === null).length;
    },
    async markRead(recipientId, ids) {
      let updated = 0;
      for (const row of store) {
        if (row.recipientId !== recipientId || row.readAt !== null) continue;
        if (ids !== 'all' && !ids.includes(row.id)) continue;
        row.readAt = new Date();
        updated += 1;
      }
      return updated;
    },
    async getPreferences(recipientId) {
      return prefs.get(recipientId) ?? { privateMessagePreview: true };
    },
    async setPreferences(recipientId, next) {
      const current = prefs.get(recipientId) ?? { privateMessagePreview: true };
      const updated = { ...current, ...next };
      prefs.set(recipientId, updated);
      return updated;
    },
    async resolveMessagePreviews(recipientId, messageIds) {
      const found = new Map<string, string>();
      for (const id of messageIds) {
        const body = messageBodies[id];
        if (body) found.set(id, body);
      }
      return found;
    },
  };

  return { repo, store };
}

function buildApp(repo: NotificationRepository) {
  const app = Fastify();
  app.register(cookie);
  app.setErrorHandler((err, request, reply) => {
    if (err instanceof ZodError) {
      reply.code(400).send(apiError(request, 'VALIDATION_ERROR', 'داده ارسالی معتبر نیست.', err.issues));
      return;
    }
    reply.send(err);
  });
  app.register(notificationRoutes, { prefix: '/v1', sessionHmacKey: SESSION_HMAC_KEY, notificationRepository: repo });
  return app;
}

function cookieFor(userId: string) {
  return { [ACCESS_TOKEN_COOKIE]: signAccessToken(userId, SESSION_HMAC_KEY) };
}

describe('who can see what', () => {
  it('requires a session on every endpoint', async () => {
    const { repo } = fakeRepo();
    const app = buildApp(repo);

    for (const [method, url] of [
      ['GET', '/v1/me/notifications'],
      ['POST', '/v1/me/notifications/read'],
      ['GET', '/v1/me/notification-preferences'],
      ['PATCH', '/v1/me/notification-preferences'],
    ] as const) {
      const response = await app.inject({ method, url, payload: { all: true } });
      expect(response.statusCode, `${method} ${url}`).toBe(401);
    }
    await app.close();
  });

  it('returns only the caller\'s own notifications', async () => {
    const mine = notification({ recipientId: ALICE });
    const theirs = notification({ recipientId: BOB });
    const { repo } = fakeRepo([mine, theirs]);
    const app = buildApp(repo);

    const response = await app.inject({ method: 'GET', url: '/v1/me/notifications', cookies: cookieFor(ALICE) });

    expect(response.statusCode).toBe(200);
    const ids = (response.json().items as { id: string }[]).map((n) => n.id);
    expect(ids).toEqual([mine.id]);
    expect(ids).not.toContain(theirs.id);

    await app.close();
  });

  // The endpoint takes no recipient - the session is the only input that
  // decides whose notifications come back.
  it('offers no way to ask for someone else\'s, and naming their id marks nothing', async () => {
    const theirs = notification({ recipientId: BOB });
    const { repo, store } = fakeRepo([theirs]);
    const app = buildApp(repo);

    const marked = await app.inject({
      method: 'POST',
      url: '/v1/me/notifications/read',
      cookies: cookieFor(ALICE),
      payload: { ids: [theirs.id] },
    });

    expect(marked.statusCode).toBe(200);
    expect(marked.json().updated).toBe(0);
    expect(store.find((n) => n.id === theirs.id)!.readAt).toBeNull();

    await app.close();
  });
});

describe('reading', () => {
  it('marks the ones named, and reports the badge afterwards', async () => {
    const a = notification();
    const b = notification();
    const { repo, store } = fakeRepo([a, b]);
    const app = buildApp(repo);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/me/notifications/read',
      cookies: cookieFor(ALICE),
      payload: { ids: [a.id] },
    });

    expect(response.json()).toEqual({ updated: 1, unreadCount: 1 });
    expect(store.find((n) => n.id === a.id)!.readAt).not.toBeNull();
    expect(store.find((n) => n.id === b.id)!.readAt).toBeNull();

    await app.close();
  });

  it('marks everything at once', async () => {
    const { repo } = fakeRepo([notification(), notification(), notification({ recipientId: BOB })]);
    const app = buildApp(repo);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/me/notifications/read',
      cookies: cookieFor(ALICE),
      payload: { all: true },
    });

    // Alice's two, and not Bob's.
    expect(response.json()).toEqual({ updated: 2, unreadCount: 0 });
    await app.close();
  });

  it('is idempotent - marking an already-read one changes nothing', async () => {
    const a = notification();
    const { repo } = fakeRepo([a]);
    const app = buildApp(repo);

    await app.inject({ method: 'POST', url: '/v1/me/notifications/read', cookies: cookieFor(ALICE), payload: { all: true } });
    const again = await app.inject({
      method: 'POST',
      url: '/v1/me/notifications/read',
      cookies: cookieFor(ALICE),
      payload: { all: true },
    });

    expect(again.json()).toEqual({ updated: 0, unreadCount: 0 });
    await app.close();
  });

  it('rejects a body that names both or neither', async () => {
    const { repo } = fakeRepo();
    const app = buildApp(repo);

    for (const payload of [{}, { ids: [randomUUID()], all: true }, { ids: [] }]) {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/me/notifications/read',
        cookies: cookieFor(ALICE),
        payload,
      });
      expect(response.statusCode).toBe(400);
    }
    await app.close();
  });

  it('reports the unread count alongside the list, for the badge', async () => {
    const { repo } = fakeRepo([notification(), notification({ readAt: new Date() })]);
    const app = buildApp(repo);

    const response = await app.inject({ method: 'GET', url: '/v1/me/notifications', cookies: cookieFor(ALICE) });
    expect(response.json().unreadCount).toBe(1);

    await app.close();
  });

  it('rejects a cursor it did not issue', async () => {
    const { repo } = fakeRepo();
    const app = buildApp(repo);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/me/notifications?cursor=not-ours',
      cookies: cookieFor(ALICE),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_CURSOR');

    await app.close();
  });
});

describe('the private-message preview', () => {
  const messageId = randomUUID();

  function withPrivateMessage(body: string) {
    return fakeRepo([notification({ type: 'NEW_PRIVATE_MESSAGE', subjectType: 'Message', subjectId: messageId })], {
      [messageId]: body,
    });
  }

  it('is shown by default, resolved from the message itself', async () => {
    const { repo } = withPrivateMessage('سلام، فردا میام دنبال نردبان');
    const app = buildApp(repo);

    const response = await app.inject({ method: 'GET', url: '/v1/me/notifications', cookies: cookieFor(ALICE) });
    expect(response.json().items[0].preview).toBe('سلام، فردا میام دنبال نردبان');

    await app.close();
  });

  it('never exceeds the ceiling', async () => {
    const { repo } = withPrivateMessage('الف '.repeat(200));
    const app = buildApp(repo);

    const response = await app.inject({ method: 'GET', url: '/v1/me/notifications', cookies: cookieFor(ALICE) });
    expect((response.json().items[0].preview as string).length).toBeLessThanOrEqual(PREVIEW_MAX_CHARS + 1);

    await app.close();
  });

  it('disappears entirely once the recipient switches previews off, while the notification still arrives', async () => {
    const { repo } = withPrivateMessage('متن خصوصی که نباید دیده شود');
    const app = buildApp(repo);

    await app.inject({
      method: 'PATCH',
      url: '/v1/me/notification-preferences',
      cookies: cookieFor(ALICE),
      payload: { privateMessagePreview: false },
    });

    const response = await app.inject({ method: 'GET', url: '/v1/me/notifications', cookies: cookieFor(ALICE) });
    const item = response.json().items[0];

    // Still told someone wrote; simply not told what they said.
    expect(item.type).toBe('NEW_PRIVATE_MESSAGE');
    expect(item.preview).toBeNull();
    expect(response.body).not.toContain('متن خصوصی که نباید دیده شود');

    await app.close();
  });

  it('is only ever attached to a private message, never to other kinds', async () => {
    const { repo } = fakeRepo([notification({ type: 'NEW_PUBLIC_REPLY' }), notification({ type: 'MODERATION_UPDATE' })]);
    const app = buildApp(repo);

    const response = await app.inject({ method: 'GET', url: '/v1/me/notifications', cookies: cookieFor(ALICE) });
    for (const item of response.json().items as { preview: string | null }[]) {
      expect(item.preview).toBeNull();
    }

    await app.close();
  });

  it('is null when the message is gone, rather than showing a stale copy', async () => {
    // Nothing is stored, so a deleted message simply resolves to nothing.
    const { repo } = fakeRepo(
      [notification({ type: 'NEW_PRIVATE_MESSAGE', subjectType: 'Message', subjectId: messageId })],
      {}
    );
    const app = buildApp(repo);

    const response = await app.inject({ method: 'GET', url: '/v1/me/notifications', cookies: cookieFor(ALICE) });
    expect(response.json().items[0].preview).toBeNull();

    await app.close();
  });
});

describe('preferences', () => {
  it('defaults previews on for someone who never set them', async () => {
    const { repo } = fakeRepo();
    const app = buildApp(repo);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/me/notification-preferences',
      cookies: cookieFor(ALICE),
    });
    expect(response.json()).toEqual({ privateMessagePreview: true });

    await app.close();
  });

  it('round-trips a change', async () => {
    const { repo } = fakeRepo();
    const app = buildApp(repo);

    const patched = await app.inject({
      method: 'PATCH',
      url: '/v1/me/notification-preferences',
      cookies: cookieFor(ALICE),
      payload: { privateMessagePreview: false },
    });
    expect(patched.json()).toEqual({ privateMessagePreview: false });

    const read = await app.inject({ method: 'GET', url: '/v1/me/notification-preferences', cookies: cookieFor(ALICE) });
    expect(read.json()).toEqual({ privateMessagePreview: false });

    await app.close();
  });

  it('rejects an empty change', async () => {
    const { repo } = fakeRepo();
    const app = buildApp(repo);

    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/me/notification-preferences',
      cookies: cookieFor(ALICE),
      payload: {},
    });
    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it('keeps one person\'s preference off another\'s', async () => {
    const { repo } = fakeRepo();
    const app = buildApp(repo);

    await app.inject({
      method: 'PATCH',
      url: '/v1/me/notification-preferences',
      cookies: cookieFor(ALICE),
      payload: { privateMessagePreview: false },
    });

    const bobs = await app.inject({
      method: 'GET',
      url: '/v1/me/notification-preferences',
      cookies: cookieFor(BOB),
    });
    expect(bobs.json()).toEqual({ privateMessagePreview: true });

    await app.close();
  });
});
