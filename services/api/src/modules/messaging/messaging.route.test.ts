import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { apiError } from '../../lib/api-error';
import { ACCESS_TOKEN_COOKIE, signAccessToken } from '../auth/session-tokens';
import { messagingRoutes } from './messaging.route';
import { MESSAGE_BODY_MAX } from '@taavon/contracts';
import type { ConversationRecord, MessageRecord, MessagingRepository } from './messaging.service';

const SESSION_HMAC_KEY = 'test-only-session-hmac-key';
const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const MALLORY = '33333333-3333-4333-8333-333333333333';

/**
 * An in-memory stand-in with the same access rules the real one enforces
 * through the database. Conversations start with Alice and Bob in them;
 * Mallory is in none of them.
 */
function fakeRepo() {
  const conversations = new Map<string, ConversationRecord>();
  const messages = new Map<string, MessageRecord>();
  const receipts = new Map<string, { lastReadMessageId: string | null; lastReadAt: Date }>();
  const prefs = new Map<string, { muted: boolean; hidden: boolean }>();
  let clock = 0;

  const direct: ConversationRecord = {
    id: randomUUID(),
    kind: 'DIRECT',
    createdAt: new Date((clock += 1000)),
    memberIds: [ALICE, BOB],
    lastMessageAt: null,
  };
  conversations.set(direct.id, direct);

  const repo: MessagingRepository = {
    async findConversation(id) {
      return conversations.get(id) ?? null;
    },
    async isMember(id, userId) {
      return conversations.get(id)?.memberIds.includes(userId) ?? false;
    },
    async userExists(userId) {
      return [ALICE, BOB, MALLORY].includes(userId);
    },
    async getOrCreateDirect(a, b) {
      const key = [a, b].sort().join(':');
      for (const c of conversations.values()) {
        if (c.kind === 'DIRECT' && [...c.memberIds].sort().join(':') === key) return c;
      }
      const created: ConversationRecord = {
        id: randomUUID(),
        kind: 'DIRECT',
        createdAt: new Date((clock += 1000)),
        memberIds: [a, b],
        lastMessageAt: null,
      };
      conversations.set(created.id, created);
      return created;
    },
    async getOrCreateAssistant(userId) {
      for (const c of conversations.values()) {
        if (c.kind === 'SYSTEM_ASSISTANT' && c.memberIds[0] === userId) return c;
      }
      const created: ConversationRecord = {
        id: randomUUID(),
        kind: 'SYSTEM_ASSISTANT',
        createdAt: new Date((clock += 1000)),
        memberIds: [userId],
        lastMessageAt: null,
      };
      conversations.set(created.id, created);
      return created;
    },
    async listConversationsForUser(userId, { limit }) {
      return [...conversations.values()]
        .filter((c) => c.memberIds.includes(userId))
        .filter((c) => !(prefs.get(`${c.id}:${userId}`)?.hidden ?? false))
        .slice(0, limit);
    },
    async countUnread() {
      return 0;
    },
    async listMessages(conversationId, { limit }) {
      return [...messages.values()]
        .filter((m) => m.conversationId === conversationId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit);
    },
    async findMessage(id) {
      return messages.get(id) ?? null;
    },
    async insertMessage({ conversationId, senderId, senderKind, body, clientMessageId }) {
      if (clientMessageId) {
        const already = [...messages.values()].find(
          (m) => m.conversationId === conversationId && m.clientMessageId === clientMessageId
        );
        if (already) return already;
      }
      const record: MessageRecord = {
        id: randomUUID(),
        conversationId,
        senderId,
        senderKind,
        status: 'VISIBLE',
        body,
        revisionCount: 1,
        clientMessageId: clientMessageId ?? null,
        proposedAction: null,
        proposalState: 'NONE',
        createdAt: new Date((clock += 1000)),
        updatedAt: new Date(clock),
      };
      messages.set(record.id, record);
      return record;
    },
    async addRevision({ messageId, body }) {
      const m = messages.get(messageId)!;
      m.body = body;
      m.revisionCount += 1;
      m.updatedAt = new Date((clock += 1000));
      return m;
    },
    async softDelete({ messageId }) {
      const m = messages.get(messageId)!;
      m.status = 'DELETED';
      m.body = null;
      return m;
    },
    async upsertReceipt({ conversationId, userId, lastReadMessageId }) {
      const at = new Date((clock += 1000));
      receipts.set(`${conversationId}:${userId}`, { lastReadMessageId, lastReadAt: at });
      return { conversationId, userId, lastReadMessageId, lastReadAt: at };
    },
    async getPreferences(conversationId, userId) {
      return prefs.get(`${conversationId}:${userId}`) ?? { muted: false, hidden: false };
    },
    async setPreferences(conversationId, userId, next) {
      const key = `${conversationId}:${userId}`;
      const current = prefs.get(key) ?? { muted: false, hidden: false };
      const updated = { muted: next.muted ?? current.muted, hidden: next.hidden ?? current.hidden };
      prefs.set(key, updated);
      return updated;
    },
    async decideProposal({ messageId, decision }) {
      const m = messages.get(messageId)!;
      m.proposalState = decision === 'CONFIRM' ? 'CONFIRMED' : 'REJECTED';
      return m;
    },
  };

  return { repo, directId: direct.id, messages };
}

function buildApp(repo: MessagingRepository) {
  const app = Fastify();
  app.register(cookie);
  app.setErrorHandler((err, request, reply) => {
    if (err instanceof ZodError) {
      reply.code(400).send(apiError(request, 'VALIDATION_ERROR', 'داده ارسالی معتبر نیست.', err.issues));
      return;
    }
    reply.send(err);
  });
  app.register(messagingRoutes, { prefix: '/v1', sessionHmacKey: SESSION_HMAC_KEY, messagingRepository: repo });
  return app;
}

function cookieFor(userId: string) {
  return { [ACCESS_TOKEN_COOKIE]: signAccessToken(userId, SESSION_HMAC_KEY) };
}

describe('private messaging over HTTP', () => {
  it('requires a session on every endpoint', async () => {
    const { repo, directId } = fakeRepo();
    const app = buildApp(repo);

    for (const [method, url] of [
      ['GET', '/v1/conversations'],
      ['POST', '/v1/conversations'],
      ['GET', '/v1/conversations/assistant'],
      ['GET', `/v1/conversations/${directId}/messages`],
      ['POST', `/v1/conversations/${directId}/messages`],
      ['POST', `/v1/conversations/${directId}/read`],
      ['PATCH', `/v1/messages/${randomUUID()}`],
      ['DELETE', `/v1/messages/${randomUUID()}`],
    ] as const) {
      const response = await app.inject({ method, url, payload: {} });
      expect(response.statusCode, `${method} ${url}`).toBe(401);
    }
    await app.close();
  });

  it('lets a member send, read, edit and delete their own message', async () => {
    const { repo, directId } = fakeRepo();
    const app = buildApp(repo);

    const sent = await app.inject({
      method: 'POST',
      url: `/v1/conversations/${directId}/messages`,
      cookies: cookieFor(ALICE),
      payload: { body: 'سلام بابک' },
    });
    expect(sent.statusCode).toBe(201);
    const messageId = sent.json().id as string;
    expect(sent.json()).toMatchObject({ senderId: ALICE, senderKind: 'USER', body: 'سلام بابک' });

    const listed = await app.inject({
      method: 'GET',
      url: `/v1/conversations/${directId}/messages`,
      cookies: cookieFor(BOB),
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().items).toHaveLength(1);

    const edited = await app.inject({
      method: 'PATCH',
      url: `/v1/messages/${messageId}`,
      cookies: cookieFor(ALICE),
      payload: { body: 'سلام بابک عزیز' },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json()).toMatchObject({ body: 'سلام بابک عزیز', edited: true });

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/v1/messages/${messageId}`,
      cookies: cookieFor(ALICE),
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toMatchObject({ status: 'DELETED', body: null });

    await app.close();
  });

  it('answers a non-member with 404 on every read and write, never 403', async () => {
    const { repo, directId } = fakeRepo();
    const app = buildApp(repo);

    const sent = await app.inject({
      method: 'POST',
      url: `/v1/conversations/${directId}/messages`,
      cookies: cookieFor(ALICE),
      payload: { body: 'خصوصی' },
    });
    const messageId = sent.json().id as string;

    const attempts = [
      await app.inject({ method: 'GET', url: `/v1/conversations/${directId}/messages`, cookies: cookieFor(MALLORY) }),
      await app.inject({
        method: 'POST',
        url: `/v1/conversations/${directId}/messages`,
        cookies: cookieFor(MALLORY),
        payload: { body: 'نفوذ' },
      }),
      await app.inject({
        method: 'PATCH',
        url: `/v1/messages/${messageId}`,
        cookies: cookieFor(MALLORY),
        payload: { body: 'دستکاری' },
      }),
      await app.inject({ method: 'DELETE', url: `/v1/messages/${messageId}`, cookies: cookieFor(MALLORY) }),
      await app.inject({
        method: 'POST',
        url: `/v1/conversations/${directId}/read`,
        cookies: cookieFor(MALLORY),
        payload: { lastReadMessageId: messageId },
      }),
    ];

    for (const response of attempts) {
      expect(response.statusCode).toBe(404);
      // Not a hint of the text, the other members, or the fact it exists.
      expect(response.body).not.toContain('خصوصی');
      expect(response.body).not.toContain(ALICE);
      expect(response.body).not.toContain(BOB);
    }

    await app.close();
  });

  it('gives a non-member the same 404 for a conversation that does not exist at all', async () => {
    const { repo, directId } = fakeRepo();
    const app = buildApp(repo);

    const real = await app.inject({
      method: 'GET',
      url: `/v1/conversations/${directId}/messages`,
      cookies: cookieFor(MALLORY),
    });
    const imaginary = await app.inject({
      method: 'GET',
      url: `/v1/conversations/${randomUUID()}/messages`,
      cookies: cookieFor(MALLORY),
    });

    expect(real.statusCode).toBe(imaginary.statusCode);
    expect(real.json().error.code).toBe(imaginary.json().error.code);
    expect(real.json().error.message).toBe(imaginary.json().error.message);

    await app.close();
  });

  it('refuses to let a member edit or delete someone else\'s message', async () => {
    const { repo, directId } = fakeRepo();
    const app = buildApp(repo);

    const sent = await app.inject({
      method: 'POST',
      url: `/v1/conversations/${directId}/messages`,
      cookies: cookieFor(ALICE),
      payload: { body: 'مال آلیس' },
    });
    const messageId = sent.json().id as string;

    const edit = await app.inject({
      method: 'PATCH',
      url: `/v1/messages/${messageId}`,
      cookies: cookieFor(BOB),
      payload: { body: 'تغییر توسط باب' },
    });
    const remove = await app.inject({ method: 'DELETE', url: `/v1/messages/${messageId}`, cookies: cookieFor(BOB) });

    // A member may know the message exists - they can see it - so this is
    // the one case that is honestly a 403 rather than a 404.
    expect(edit.statusCode).toBe(403);
    expect(remove.statusCode).toBe(403);

    await app.close();
  });

  it('opens a direct conversation idempotently, and refuses one with oneself', async () => {
    const { repo } = fakeRepo();
    const app = buildApp(repo);

    const first = await app.inject({
      method: 'POST',
      url: '/v1/conversations',
      cookies: cookieFor(ALICE),
      payload: { withUserId: MALLORY },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/v1/conversations',
      cookies: cookieFor(ALICE),
      payload: { withUserId: MALLORY },
    });

    expect(first.statusCode).toBe(200);
    expect(second.json().id).toBe(first.json().id);

    const withSelf = await app.inject({
      method: 'POST',
      url: '/v1/conversations',
      cookies: cookieFor(ALICE),
      payload: { withUserId: ALICE },
    });
    expect(withSelf.statusCode).toBe(422);

    await app.close();
  });

  it('serves each person only their own assistant thread, and offers no route to anyone else\'s', async () => {
    const { repo } = fakeRepo();
    const app = buildApp(repo);

    const alices = await app.inject({ method: 'GET', url: '/v1/conversations/assistant', cookies: cookieFor(ALICE) });
    const again = await app.inject({ method: 'GET', url: '/v1/conversations/assistant', cookies: cookieFor(ALICE) });
    const bobs = await app.inject({ method: 'GET', url: '/v1/conversations/assistant', cookies: cookieFor(BOB) });

    expect(alices.statusCode).toBe(200);
    expect(alices.json()).toMatchObject({ kind: 'SYSTEM_ASSISTANT', members: [{ userId: ALICE }] });
    expect(again.json().id).toBe(alices.json().id);
    expect(bobs.json().id).not.toBe(alices.json().id);

    await app.close();
  });

  it('gives no way to post as the assistant - a request can only ever send as itself', async () => {
    const { repo } = fakeRepo();
    const app = buildApp(repo);

    const assistant = await app.inject({ method: 'GET', url: '/v1/conversations/assistant', cookies: cookieFor(ALICE) });
    const conversationId = assistant.json().id as string;

    // Every shape a caller might try to smuggle a sender through. The route
    // reads only `body` from the payload, so each of these is either
    // ignored or rejected by the schema - none can produce a message that
    // is not attributed to Alice.
    for (const payload of [
      { body: 'تلاش', senderId: null },
      { body: 'تلاش', senderKind: 'SYSTEM_ASSISTANT' },
      { body: 'تلاش', senderId: BOB },
      { body: 'تلاش', credential: 'messaging.internal-service-credential' },
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: `/v1/conversations/${conversationId}/messages`,
        cookies: cookieFor(ALICE),
        payload,
      });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ senderId: ALICE, senderKind: 'USER' });
    }

    await app.close();
  });

  it('enforces the message length bounds', async () => {
    const { repo, directId } = fakeRepo();
    const app = buildApp(repo);

    const empty = await app.inject({
      method: 'POST',
      url: `/v1/conversations/${directId}/messages`,
      cookies: cookieFor(ALICE),
      payload: { body: '   ' },
    });
    expect(empty.statusCode).toBe(400);

    const tooLong = await app.inject({
      method: 'POST',
      url: `/v1/conversations/${directId}/messages`,
      cookies: cookieFor(ALICE),
      payload: { body: 'ا'.repeat(MESSAGE_BODY_MAX + 1) },
    });
    expect(tooLong.statusCode).toBe(400);

    const atTheLimit = await app.inject({
      method: 'POST',
      url: `/v1/conversations/${directId}/messages`,
      cookies: cookieFor(ALICE),
      payload: { body: 'ا'.repeat(MESSAGE_BODY_MAX) },
    });
    expect(atTheLimit.statusCode).toBe(201);

    await app.close();
  });

  it('records a read receipt, and rejects a message from another conversation', async () => {
    const { repo, directId } = fakeRepo();
    const app = buildApp(repo);

    const sent = await app.inject({
      method: 'POST',
      url: `/v1/conversations/${directId}/messages`,
      cookies: cookieFor(ALICE),
      payload: { body: 'پیام' },
    });
    const messageId = sent.json().id as string;

    const read = await app.inject({
      method: 'POST',
      url: `/v1/conversations/${directId}/read`,
      cookies: cookieFor(BOB),
      payload: { lastReadMessageId: messageId },
    });
    expect(read.statusCode).toBe(200);
    expect(read.json()).toMatchObject({ userId: BOB, lastReadMessageId: messageId });

    const assistant = await app.inject({ method: 'GET', url: '/v1/conversations/assistant', cookies: cookieFor(BOB) });
    const mismatched = await app.inject({
      method: 'POST',
      url: `/v1/conversations/${assistant.json().id}/read`,
      cookies: cookieFor(BOB),
      payload: { lastReadMessageId: messageId },
    });
    expect(mismatched.statusCode).toBe(422);

    await app.close();
  });

  it('lists a conversation with bare member ids and a timestamp, never a message preview', async () => {
    const { repo, directId } = fakeRepo();
    const app = buildApp(repo);

    await app.inject({
      method: 'POST',
      url: `/v1/conversations/${directId}/messages`,
      cookies: cookieFor(ALICE),
      payload: { body: 'متن-حساس-نباید-در-فهرست-باشد' },
    });

    const list = await app.inject({ method: 'GET', url: '/v1/conversations', cookies: cookieFor(ALICE) });
    expect(list.statusCode).toBe(200);
    expect(list.body).not.toContain('متن-حساس-نباید-در-فهرست-باشد');

    for (const conversation of list.json().items as { members: Record<string, unknown>[] }[]) {
      for (const member of conversation.members) {
        expect(Object.keys(member)).toEqual(['userId']);
      }
    }

    await app.close();
  });

  it('rejects a pagination cursor it did not issue', async () => {
    const { repo, directId } = fakeRepo();
    const app = buildApp(repo);

    const response = await app.inject({
      method: 'GET',
      url: `/v1/conversations/${directId}/messages?cursor=not-one-of-ours`,
      cookies: cookieFor(ALICE),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_CURSOR');

    await app.close();
  });

  describe('muting and hiding, for one person only', () => {
    it('takes a hidden thread out of the list without touching anything else', async () => {
      const { repo, directId } = fakeRepo();
      const app = buildApp(repo);

      const before = await app.inject({ method: 'GET', url: '/v1/conversations', cookies: cookieFor(ALICE) });
      expect((before.json().items as { id: string }[]).map((c) => c.id)).toContain(directId);

      const hidden = await app.inject({
        method: 'PATCH',
        url: `/v1/conversations/${directId}/preferences`,
        cookies: cookieFor(ALICE),
        payload: { hidden: true },
      });
      expect(hidden.statusCode).toBe(200);
      expect(hidden.json()).toMatchObject({ hidden: true });

      const after = await app.inject({ method: 'GET', url: '/v1/conversations', cookies: cookieFor(ALICE) });
      expect((after.json().items as { id: string }[]).map((c) => c.id)).not.toContain(directId);

      // Still fully reachable by id - hiding is a list preference, not a
      // removal, and the messages are untouched.
      const stillThere = await app.inject({
        method: 'GET',
        url: `/v1/conversations/${directId}/messages`,
        cookies: cookieFor(ALICE),
      });
      expect(stillThere.statusCode).toBe(200);

      await app.close();
    });

    it('hides for one person without hiding for the other', async () => {
      const { repo, directId } = fakeRepo();
      const app = buildApp(repo);

      await app.inject({
        method: 'PATCH',
        url: `/v1/conversations/${directId}/preferences`,
        cookies: cookieFor(ALICE),
        payload: { hidden: true },
      });

      const bobs = await app.inject({ method: 'GET', url: '/v1/conversations', cookies: cookieFor(BOB) });
      expect((bobs.json().items as { id: string }[]).map((c) => c.id)).toContain(directId);

      await app.close();
    });

    it('always serves the assistant thread, even hidden - that is how someone gets back to it', async () => {
      const { repo } = fakeRepo();
      const app = buildApp(repo);

      const assistant = await app.inject({ method: 'GET', url: '/v1/conversations/assistant', cookies: cookieFor(ALICE) });
      const assistantId = assistant.json().id as string;

      await app.inject({
        method: 'PATCH',
        url: `/v1/conversations/${assistantId}/preferences`,
        cookies: cookieFor(ALICE),
        payload: { hidden: true },
      });

      const list = await app.inject({ method: 'GET', url: '/v1/conversations', cookies: cookieFor(ALICE) });
      expect((list.json().items as { id: string }[]).map((c) => c.id)).not.toContain(assistantId);

      const reached = await app.inject({ method: 'GET', url: '/v1/conversations/assistant', cookies: cookieFor(ALICE) });
      expect(reached.statusCode).toBe(200);
      expect(reached.json()).toMatchObject({ id: assistantId, hidden: true });

      await app.close();
    });

    it('mutes without hiding, and each flag is independent', async () => {
      const { repo, directId } = fakeRepo();
      const app = buildApp(repo);

      const muted = await app.inject({
        method: 'PATCH',
        url: `/v1/conversations/${directId}/preferences`,
        cookies: cookieFor(ALICE),
        payload: { muted: true },
      });
      expect(muted.json()).toMatchObject({ muted: true, hidden: false });

      const unmuted = await app.inject({
        method: 'PATCH',
        url: `/v1/conversations/${directId}/preferences`,
        cookies: cookieFor(ALICE),
        payload: { muted: false },
      });
      expect(unmuted.json()).toMatchObject({ muted: false, hidden: false });

      await app.close();
    });

    it('refuses a non-member, and an empty body', async () => {
      const { repo, directId } = fakeRepo();
      const app = buildApp(repo);

      const stranger = await app.inject({
        method: 'PATCH',
        url: `/v1/conversations/${directId}/preferences`,
        cookies: cookieFor(MALLORY),
        payload: { muted: true },
      });
      expect(stranger.statusCode).toBe(404);

      const empty = await app.inject({
        method: 'PATCH',
        url: `/v1/conversations/${directId}/preferences`,
        cookies: cookieFor(ALICE),
        payload: {},
      });
      expect(empty.statusCode).toBe(400);

      await app.close();
    });
  });

  describe('deciding on what the assistant suggested', () => {
    it('refuses a decision on an ordinary message from a person', async () => {
      const { repo, directId } = fakeRepo();
      const app = buildApp(repo);

      const sent = await app.inject({
        method: 'POST',
        url: `/v1/conversations/${directId}/messages`,
        cookies: cookieFor(ALICE),
        payload: { body: 'یک پیام معمولی' },
      });

      const decided = await app.inject({
        method: 'POST',
        url: `/v1/messages/${sent.json().id}/proposal`,
        cookies: cookieFor(ALICE),
        payload: { decision: 'CONFIRM' },
      });
      expect(decided.statusCode).toBe(422);
      expect(decided.json().error.code).toBe('NO_PENDING_PROPOSAL');

      await app.close();
    });

    it('reports a message that does not exist as not found', async () => {
      const { repo } = fakeRepo();
      const app = buildApp(repo);

      const decided = await app.inject({
        method: 'POST',
        url: `/v1/messages/${randomUUID()}/proposal`,
        cookies: cookieFor(ALICE),
        payload: { decision: 'CONFIRM' },
      });
      expect(decided.statusCode).toBe(404);

      await app.close();
    });

    it('rejects a decision that is neither confirm nor reject', async () => {
      const { repo, directId } = fakeRepo();
      const app = buildApp(repo);

      const sent = await app.inject({
        method: 'POST',
        url: `/v1/conversations/${directId}/messages`,
        cookies: cookieFor(ALICE),
        payload: { body: 'x' },
      });

      const decided = await app.inject({
        method: 'POST',
        url: `/v1/messages/${sent.json().id}/proposal`,
        cookies: cookieFor(ALICE),
        payload: { decision: 'PUBLISH_IT_ANYWAY' },
      });
      expect(decided.statusCode).toBe(400);

      await app.close();
    });
  });
});
