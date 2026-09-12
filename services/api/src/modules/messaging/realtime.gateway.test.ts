import { createServer, type Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import type { Server } from 'socket.io';
import { REALTIME_EVENTS } from '@taavon/contracts';
import { ACCESS_TOKEN_COOKIE, signAccessToken } from '../auth/session-tokens';
import { createFakeRateLimiter } from '../auth/rate-limiter';
import { createRealtimeGateway } from './realtime.gateway';
import type { SessionLivenessPort } from './realtime-auth';
import type { ConversationRecord, MessageRecord, MessagingRepository } from './messaging.service';

const SECRET = 'test-only-session-hmac-key';
const APP_ORIGIN = 'http://localhost:4300';
const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const MALLORY = '33333333-3333-4333-8333-333333333333';

function fakeRepo() {
  const conversations = new Map<string, ConversationRecord>();
  const messages = new Map<string, MessageRecord>();
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
    async userExists() {
      return true;
    },
    async getOrCreateDirect() {
      return direct;
    },
    async getOrCreateAssistant() {
      return direct;
    },
    async listConversationsForUser() {
      return [direct];
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
      return m;
    },
    async softDelete({ messageId }) {
      const m = messages.get(messageId)!;
      m.status = 'DELETED';
      m.body = null;
      return m;
    },
    async upsertReceipt({ conversationId, userId, lastReadMessageId }) {
      return { conversationId, userId, lastReadMessageId, lastReadAt: new Date((clock += 1000)) };
    },
  };

  return { repo, directId: direct.id, messages };
}

interface Harness {
  url: string;
  io: Server;
  http: HttpServer;
  liveUsers: Set<string>;
}

const openSockets: ClientSocket[] = [];
const harnesses: Harness[] = [];

async function startGateway(
  overrides: Partial<Parameters<typeof createRealtimeGateway>[1]> = {},
  repo?: MessagingRepository
): Promise<Harness> {
  const http = createServer();
  const liveUsers = new Set([ALICE, BOB, MALLORY]);
  const liveness: SessionLivenessPort = { hasLiveSession: async (userId) => liveUsers.has(userId) };

  const io = createRealtimeGateway(http, {
    sessionHmacKey: SECRET,
    appOrigin: APP_ORIGIN,
    messagingRepository: repo ?? fakeRepo().repo,
    sessionLiveness: liveness,
    redis: null,
    sendRateLimiter: createFakeRateLimiter(100, 60),
    ...overrides,
  });

  await new Promise<void>((resolve) => http.listen(0, resolve));
  const address = http.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  const harness: Harness = { url: `http://localhost:${port}`, io, http, liveUsers };
  harnesses.push(harness);
  return harness;
}

function clientFor(harness: Harness, userId: string | null, origin: string = APP_ORIGIN): ClientSocket {
  const headers: Record<string, string> = { origin };
  if (userId) headers.cookie = `${ACCESS_TOKEN_COOKIE}=${signAccessToken(userId, SECRET)}`;

  const socket = connect(harness.url, {
    path: '/socket.io/',
    transports: ['websocket'],
    extraHeaders: headers,
    reconnection: false,
    forceNew: true,
  });
  openSockets.push(socket);
  return socket;
}

function connected(socket: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', (err: Error) => reject(err));
  });
}

function nextEvent<T = unknown>(socket: ClientSocket, event: string, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function emitWithAck<T = unknown>(socket: ClientSocket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ack of ${event}`)), 3000);
    socket.emit(event, payload, (result: T) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
}

afterEach(async () => {
  for (const socket of openSockets.splice(0)) socket.disconnect();
  for (const harness of harnesses.splice(0)) {
    await harness.io.close();
    await new Promise<void>((resolve) => harness.http.close(() => resolve()));
  }
});

describe('who may open a socket at all', () => {
  it('refuses a connection with no session', async () => {
    const harness = await startGateway();
    await expect(connected(clientFor(harness, null))).rejects.toThrow('SESSION_INVALID');
  });

  it('refuses a connection from a foreign origin, session or not', async () => {
    const harness = await startGateway();
    await expect(connected(clientFor(harness, ALICE, 'https://evil.example'))).rejects.toThrow('ORIGIN_NOT_ALLOWED');
  });

  it('refuses a session that has been revoked, before any event is exchanged', async () => {
    const harness = await startGateway();
    harness.liveUsers.delete(ALICE);
    await expect(connected(clientFor(harness, ALICE))).rejects.toThrow('SESSION_REVOKED');
  });

  it('admits a valid session from the right origin', async () => {
    const harness = await startGateway();
    await expect(connected(clientFor(harness, ALICE))).resolves.toBeUndefined();
  });
});

describe('joining a conversation', () => {
  it('lets a member in', async () => {
    const { repo, directId } = fakeRepo();
    const harness = await startGateway({}, repo);
    const alice = clientFor(harness, ALICE);
    await connected(alice);

    await expect(emitWithAck(alice, REALTIME_EVENTS.join, { conversationId: directId })).resolves.toEqual({
      joined: directId,
    });
  });

  it('keeps a non-member out of a room they name directly, and tells them nothing about it', async () => {
    const { repo, directId } = fakeRepo();
    const harness = await startGateway({}, repo);
    const mallory = clientFor(harness, MALLORY);
    await connected(mallory);

    const error = nextEvent<{ code: string }>(mallory, REALTIME_EVENTS.error);
    mallory.emit(REALTIME_EVENTS.join, { conversationId: directId });
    await expect(error).resolves.toMatchObject({ code: 'CONVERSATION_NOT_FOUND' });
  });

  it('never delivers a room\'s messages to a non-member who asked to join it', async () => {
    const { repo, directId } = fakeRepo();
    const harness = await startGateway({}, repo);

    const alice = clientFor(harness, ALICE);
    const mallory = clientFor(harness, MALLORY);
    await Promise.all([connected(alice), connected(mallory)]);

    await emitWithAck(alice, REALTIME_EVENTS.join, { conversationId: directId });
    mallory.emit(REALTIME_EVENTS.join, { conversationId: directId }); // refused
    await nextEvent(mallory, REALTIME_EVENTS.error);

    let leaked: unknown = null;
    mallory.on(REALTIME_EVENTS.messageCreated, (m: unknown) => {
      leaked = m;
    });

    await emitWithAck(alice, REALTIME_EVENTS.messageSend, {
      conversationId: directId,
      body: 'محرمانه',
      clientMessageId: randomUUID(),
    });
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(leaked).toBeNull();
  });

  it('refuses a send into a conversation the sender is not in, even without joining first', async () => {
    const { repo, directId } = fakeRepo();
    const harness = await startGateway({}, repo);
    const mallory = clientFor(harness, MALLORY);
    await connected(mallory);

    const error = nextEvent<{ code: string }>(mallory, REALTIME_EVENTS.error);
    mallory.emit(REALTIME_EVENTS.messageSend, {
      conversationId: directId,
      body: 'نفوذ',
      clientMessageId: randomUUID(),
    });
    await expect(error).resolves.toMatchObject({ code: 'CONVERSATION_NOT_FOUND' });
  });
});

describe('sending', () => {
  it('persists before it emits, so a message a peer sees is already stored', async () => {
    const { repo, directId, messages } = fakeRepo();
    const harness = await startGateway({}, repo);

    const alice = clientFor(harness, ALICE);
    const bob = clientFor(harness, BOB);
    await Promise.all([connected(alice), connected(bob)]);
    await Promise.all([
      emitWithAck(alice, REALTIME_EVENTS.join, { conversationId: directId }),
      emitWithAck(bob, REALTIME_EVENTS.join, { conversationId: directId }),
    ]);

    const delivered = nextEvent<{ id: string; body: string }>(bob, REALTIME_EVENTS.messageCreated);
    alice.emit(REALTIME_EVENTS.messageSend, {
      conversationId: directId,
      body: 'سلام',
      clientMessageId: randomUUID(),
    });

    const message = await delivered;
    expect(message.body).toBe('سلام');
    // The store already holds it at the moment the peer is told about it.
    expect(messages.get(message.id)).toBeDefined();
  });

  it('echoes the message back to the sender with its own clientMessageId', async () => {
    const { repo, directId } = fakeRepo();
    const harness = await startGateway({}, repo);
    const alice = clientFor(harness, ALICE);
    await connected(alice);
    await emitWithAck(alice, REALTIME_EVENTS.join, { conversationId: directId });

    const clientMessageId = randomUUID();
    const ack = await emitWithAck<{ clientMessageId: string; senderId: string }>(
      alice,
      REALTIME_EVENTS.messageSend,
      { conversationId: directId, body: 'خودم', clientMessageId }
    );

    expect(ack.clientMessageId).toBe(clientMessageId);
    expect(ack.senderId).toBe(ALICE);
  });

  it('stores one message when the same clientMessageId is sent twice, as a reconnecting client does', async () => {
    const { repo, directId, messages } = fakeRepo();
    const harness = await startGateway({}, repo);
    const alice = clientFor(harness, ALICE);
    await connected(alice);
    await emitWithAck(alice, REALTIME_EVENTS.join, { conversationId: directId });

    const clientMessageId = randomUUID();
    const payload = { conversationId: directId, body: 'دوباره', clientMessageId };

    const first = await emitWithAck<{ id: string }>(alice, REALTIME_EVENTS.messageSend, payload);
    const second = await emitWithAck<{ id: string }>(alice, REALTIME_EVENTS.messageSend, payload);

    expect(second.id).toBe(first.id);
    expect([...messages.values()].filter((m) => m.clientMessageId === clientMessageId)).toHaveLength(1);
  });

  it('survives a genuine reconnect without losing or duplicating the message', async () => {
    const { repo, directId, messages } = fakeRepo();
    const harness = await startGateway({}, repo);
    const clientMessageId = randomUUID();

    const first = clientFor(harness, ALICE);
    await connected(first);
    await emitWithAck(first, REALTIME_EVENTS.join, { conversationId: directId });
    await emitWithAck(first, REALTIME_EVENTS.messageSend, { conversationId: directId, body: 'قبل از قطعی', clientMessageId });
    first.disconnect();

    // A client that did not see its ack reconnects and sends the same thing.
    const second = clientFor(harness, ALICE);
    await connected(second);
    await emitWithAck(second, REALTIME_EVENTS.join, { conversationId: directId });
    await emitWithAck(second, REALTIME_EVENTS.messageSend, { conversationId: directId, body: 'قبل از قطعی', clientMessageId });

    expect([...messages.values()]).toHaveLength(1);
  });

  it('rejects a malformed payload instead of storing anything', async () => {
    const { repo, directId, messages } = fakeRepo();
    const harness = await startGateway({}, repo);
    const alice = clientFor(harness, ALICE);
    await connected(alice);

    for (const bad of [
      { conversationId: directId, body: '', clientMessageId: randomUUID() },
      { conversationId: directId, body: 'x'.repeat(8001), clientMessageId: randomUUID() },
      { conversationId: 'not-a-uuid', body: 'x', clientMessageId: randomUUID() },
      { conversationId: directId, body: 'x' },
      'not even an object',
    ]) {
      const error = nextEvent<{ code: string }>(alice, REALTIME_EVENTS.error);
      alice.emit(REALTIME_EVENTS.messageSend, bad);
      await expect(error).resolves.toMatchObject({ code: 'VALIDATION_ERROR' });
    }

    expect([...messages.values()]).toHaveLength(0);
  });

  it('throttles a socket that sends too fast', async () => {
    const { repo, directId } = fakeRepo();
    const harness = await startGateway({ sendRateLimiter: createFakeRateLimiter(2, 60) }, repo);
    const alice = clientFor(harness, ALICE);
    await connected(alice);
    await emitWithAck(alice, REALTIME_EVENTS.join, { conversationId: directId });

    await emitWithAck(alice, REALTIME_EVENTS.messageSend, { conversationId: directId, body: '۱', clientMessageId: randomUUID() });
    await emitWithAck(alice, REALTIME_EVENTS.messageSend, { conversationId: directId, body: '۲', clientMessageId: randomUUID() });

    const error = nextEvent<{ code: string }>(alice, REALTIME_EVENTS.error);
    alice.emit(REALTIME_EVENTS.messageSend, { conversationId: directId, body: '۳', clientMessageId: randomUUID() });
    await expect(error).resolves.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('gives each socket its own budget, so one tab cannot spend another\'s', async () => {
    const { repo, directId } = fakeRepo();
    const harness = await startGateway({ sendRateLimiter: createFakeRateLimiter(1, 60) }, repo);

    const tabOne = clientFor(harness, ALICE);
    const tabTwo = clientFor(harness, ALICE);
    await Promise.all([connected(tabOne), connected(tabTwo)]);

    await emitWithAck(tabOne, REALTIME_EVENTS.messageSend, { conversationId: directId, body: 'یک', clientMessageId: randomUUID() });
    // The second tab still has its own first send available.
    await expect(
      emitWithAck(tabTwo, REALTIME_EVENTS.messageSend, { conversationId: directId, body: 'دو', clientMessageId: randomUUID() })
    ).resolves.toMatchObject({ body: 'دو' });
  });
});

describe('typing', () => {
  it('reaches the peer but never the sender, and is not stored anywhere', async () => {
    const { repo, directId, messages } = fakeRepo();
    const harness = await startGateway({}, repo);

    const alice = clientFor(harness, ALICE);
    const bob = clientFor(harness, BOB);
    await Promise.all([connected(alice), connected(bob)]);
    await Promise.all([
      emitWithAck(alice, REALTIME_EVENTS.join, { conversationId: directId }),
      emitWithAck(bob, REALTIME_EVENTS.join, { conversationId: directId }),
    ]);

    let echoedToSelf = false;
    alice.on(REALTIME_EVENTS.typing, () => {
      echoedToSelf = true;
    });

    const seen = nextEvent<{ userId: string; typing: boolean }>(bob, REALTIME_EVENTS.typing);
    alice.emit(REALTIME_EVENTS.typingStart, { conversationId: directId });

    await expect(seen).resolves.toEqual({ conversationId: directId, userId: ALICE, typing: true });
    expect(echoedToSelf).toBe(false);
    // Typing is a hint about the next few seconds, not a record.
    expect([...messages.values()]).toHaveLength(0);
  });

  it('refuses a typing notice for a conversation the sender is not in', async () => {
    const { repo, directId } = fakeRepo();
    const harness = await startGateway({}, repo);
    const mallory = clientFor(harness, MALLORY);
    await connected(mallory);

    const error = nextEvent<{ code: string }>(mallory, REALTIME_EVENTS.error);
    mallory.emit(REALTIME_EVENTS.typingStart, { conversationId: directId });
    await expect(error).resolves.toMatchObject({ code: 'CONVERSATION_NOT_FOUND' });
  });

  it('writes the flag to Redis under a short TTL and deletes it on stop', async () => {
    const { repo, directId } = fakeRepo();
    const calls: string[] = [];
    const redisStub = {
      set: async (key: string, _value: string, mode: string, ttl: number) => {
        calls.push(`set ${key} ${mode}=${ttl}`);
        return 'OK';
      },
      del: async (key: string) => {
        calls.push(`del ${key}`);
        return 1;
      },
    };

    const harness = await startGateway({ redis: redisStub as never }, repo);
    const alice = clientFor(harness, ALICE);
    await connected(alice);
    await emitWithAck(alice, REALTIME_EVENTS.join, { conversationId: directId });

    alice.emit(REALTIME_EVENTS.typingStart, { conversationId: directId });
    alice.emit(REALTIME_EVENTS.typingStop, { conversationId: directId });
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(calls).toEqual([`set typing:${directId}:${ALICE} EX=5`, `del typing:${directId}:${ALICE}`]);
  });
});

describe('read receipts over the socket', () => {
  it('reaches both sides of the conversation', async () => {
    const { repo, directId } = fakeRepo();
    const harness = await startGateway({}, repo);

    const alice = clientFor(harness, ALICE);
    const bob = clientFor(harness, BOB);
    await Promise.all([connected(alice), connected(bob)]);
    await Promise.all([
      emitWithAck(alice, REALTIME_EVENTS.join, { conversationId: directId }),
      emitWithAck(bob, REALTIME_EVENTS.join, { conversationId: directId }),
    ]);

    const sent = await emitWithAck<{ id: string }>(alice, REALTIME_EVENTS.messageSend, {
      conversationId: directId,
      body: 'پیام',
      clientMessageId: randomUUID(),
    });

    const seen = nextEvent<{ userId: string }>(alice, REALTIME_EVENTS.receiptRead);
    bob.emit(REALTIME_EVENTS.receiptRead, { conversationId: directId, lastReadMessageId: sent.id });

    await expect(seen).resolves.toMatchObject({ userId: BOB, lastReadMessageId: sent.id });
  });
});

describe('revoking a session while the socket is open', () => {
  it('closes the connection on the next sweep', async () => {
    const { repo } = fakeRepo();
    const harness = await startGateway({ revocationSweepIntervalMs: 50 }, repo);
    const alice = clientFor(harness, ALICE);
    await connected(alice);

    const closed = new Promise<string>((resolve) => alice.once('disconnect', (reason: string) => resolve(reason)));
    const told = nextEvent<{ code: string }>(alice, REALTIME_EVENTS.error);

    // What a logout does.
    harness.liveUsers.delete(ALICE);

    await expect(told).resolves.toMatchObject({ code: 'SESSION_REVOKED' });
    await expect(closed).resolves.toBeTruthy();
    expect(alice.connected).toBe(false);
  });

  it('leaves everyone else connected', async () => {
    const { repo } = fakeRepo();
    const harness = await startGateway({ revocationSweepIntervalMs: 50 }, repo);
    const alice = clientFor(harness, ALICE);
    const bob = clientFor(harness, BOB);
    await Promise.all([connected(alice), connected(bob)]);

    harness.liveUsers.delete(ALICE);
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(alice.connected).toBe(false);
    expect(bob.connected).toBe(true);
  });
});
