import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import type Redis from 'ioredis';
import {
  REALTIME_EVENTS,
  socketJoinSchema,
  socketReceiptReadSchema,
  socketSendMessageSchema,
  socketTypingSchema,
} from '@taavon/contracts';
import { createFakeRateLimiter, type RateLimiter } from '../auth/rate-limiter';
import {
  authenticateHandshake,
  HandshakeOriginRejectedError,
  HandshakeUnauthorizedError,
  type SessionLivenessPort,
} from './realtime-auth';
import {
  ConversationNotFoundError,
  markRead,
  sendMessage,
  type MessagingRepository,
} from './messaging.service';

/** A socket may send this many messages per window before being throttled. */
export const REALTIME_SEND_RATE_LIMIT = 30;
export const REALTIME_SEND_RATE_WINDOW_SECONDS = 60;

/** How often every open connection is re-checked against the session store. */
export const REVOCATION_SWEEP_INTERVAL_MS = 30_000;

/** How long a typing flag lives in Redis. Short enough that a client that vanishes mid-type stops "typing" on its own. */
export const TYPING_TTL_SECONDS = 5;

export interface RealtimeGatewayOptions {
  sessionHmacKey: string;
  appOrigin: string;
  messagingRepository: MessagingRepository;
  sessionLiveness: SessionLivenessPort;
  /** Typing flags only. Never used for message text. Omitted in tests that do not exercise typing. */
  redis?: Redis | null;
  sendRateLimiter?: RateLimiter;
  revocationSweepIntervalMs?: number;
  now?: () => number;
}

interface SocketUser {
  userId: string;
}

function room(conversationId: string): string {
  return `conversation:${conversationId}`;
}

function typingKey(conversationId: string, userId: string): string {
  return `typing:${conversationId}:${userId}`;
}

/**
 * Socket.IO gateway for private messaging.
 *
 * Three rules shape everything here.
 *
 * One: a connection is admitted only with an allowed origin and a valid
 * session cookie, and it is re-checked against the session store for as long
 * as it stays open - a socket outlives the fifteen-minute access token, so
 * handshake-time authentication alone would let a revoked session keep
 * streaming.
 *
 * Two: every join re-reads membership from the database. Socket.IO rooms are
 * just strings; nothing stops a client asking to join any room name it likes,
 * so the only thing that keeps a stranger out is this check, on every single
 * join, rather than a cached list from connect time.
 *
 * Three: a message is persisted before it is emitted, never the other way
 * round. If the write fails, nobody saw a message that does not exist; if the
 * emit fails, the message is still there to be fetched over REST on
 * reconnect. That ordering, plus `clientMessageId` deduplication, is what
 * makes "پیام گم/دوتایی نمی‌شود" true rather than merely likely.
 */
/** What createRealtimeGateway hands back - named so callers can hold one before it exists. */
export type RealtimeGateway = Server;

export function createRealtimeGateway(httpServer: HttpServer, opts: RealtimeGatewayOptions): RealtimeGateway {
  const sendRateLimiter =
    opts.sendRateLimiter ?? createFakeRateLimiter(REALTIME_SEND_RATE_LIMIT, REALTIME_SEND_RATE_WINDOW_SECONDS);
  const sweepInterval = opts.revocationSweepIntervalMs ?? REVOCATION_SWEEP_INTERVAL_MS;

  const io = new Server(httpServer, {
    // Socket.IO's own CORS, belt to the handshake check's braces. The
    // handshake check is the one that actually matters (see realtime-auth),
    // but a browser is refused earlier and more clearly with this set.
    cors: { origin: opts.appOrigin, credentials: true },
    // The path the reverse proxy already forwards - see deploy/Caddyfile.
    path: '/socket.io/',
  });

  io.use((socket, next) => {
    try {
      const { userId } = authenticateHandshake(
        { cookie: socket.handshake.headers.cookie, origin: socket.handshake.headers.origin },
        { sessionHmacKey: opts.sessionHmacKey, appOrigin: opts.appOrigin, now: opts.now }
      );
      (socket.data as SocketUser).userId = userId;
      next();
    } catch (err) {
      if (err instanceof HandshakeOriginRejectedError) return next(new Error('ORIGIN_NOT_ALLOWED'));
      if (err instanceof HandshakeUnauthorizedError) return next(new Error('SESSION_INVALID'));
      next(err as Error);
    }
  });

  // Liveness is checked once the token has already been verified, so an
  // unauthenticated caller never reaches the database at all.
  io.use((socket, next) => {
    const { userId } = socket.data as SocketUser;
    opts.sessionLiveness
      .hasLiveSession(userId)
      .then((live) => next(live ? undefined : new Error('SESSION_REVOKED')))
      .catch((err: Error) => next(err));
  });

  io.on('connection', (socket: Socket) => {
    const { userId } = socket.data as SocketUser;

    function fail(code: string, message: string) {
      socket.emit(REALTIME_EVENTS.error, { code, message });
    }

    /** Membership, re-read from the database. Never cached across events. */
    async function requireMember(conversationId: string): Promise<boolean> {
      const allowed = await opts.messagingRepository.isMember(conversationId, userId);
      if (!allowed) {
        // Same disclosure rule as the REST layer: a non-member is told the
        // conversation is not there, not that they are barred from it.
        fail('CONVERSATION_NOT_FOUND', 'این گفت‌وگو یافت نشد.');
      }
      return allowed;
    }

    socket.on(REALTIME_EVENTS.join, async (raw: unknown, ack?: (result: unknown) => void) => {
      const parsed = socketJoinSchema.safeParse(raw);
      if (!parsed.success) return fail('VALIDATION_ERROR', 'داده ارسالی معتبر نیست.');
      if (!(await requireMember(parsed.data.conversationId))) return;

      await socket.join(room(parsed.data.conversationId));
      ack?.({ joined: parsed.data.conversationId });
    });

    socket.on(REALTIME_EVENTS.messageSend, async (raw: unknown, ack?: (result: unknown) => void) => {
      const parsed = socketSendMessageSchema.safeParse(raw);
      if (!parsed.success) return fail('VALIDATION_ERROR', 'داده ارسالی معتبر نیست.');
      const { conversationId, body, clientMessageId } = parsed.data;

      // Keyed per user and per socket together: one tab cannot spend another
      // tab's budget, and opening many tabs does not multiply one person's.
      const limit = await sendRateLimiter.consume(`realtime:send:${userId}:${socket.id}`);
      if (!limit.allowed) {
        return fail('RATE_LIMITED', 'پیام‌های شما بیش از حد سریع است؛ کمی صبر کنید.');
      }

      try {
        // Persist first. sendMessage re-checks membership itself, so this is
        // safe even for a socket that never joined the room.
        const message = await sendMessage(opts.messagingRepository, conversationId, userId, {
          body,
          clientMessageId,
        });

        // Then emit, to the room and to this socket alike - the sender gets
        // the authoritative message back so it can replace its optimistic
        // copy by clientMessageId.
        io.to(room(conversationId)).emit(REALTIME_EVENTS.messageCreated, message);
        if (!socket.rooms.has(room(conversationId))) {
          socket.emit(REALTIME_EVENTS.messageCreated, message);
        }
        ack?.(message);
      } catch (err) {
        if (err instanceof ConversationNotFoundError) {
          return fail('CONVERSATION_NOT_FOUND', 'این گفت‌وگو یافت نشد.');
        }
        throw err;
      }
    });

    socket.on(REALTIME_EVENTS.receiptRead, async (raw: unknown, ack?: (result: unknown) => void) => {
      const parsed = socketReceiptReadSchema.safeParse(raw);
      if (!parsed.success) return fail('VALIDATION_ERROR', 'داده ارسالی معتبر نیست.');

      try {
        const receipt = await markRead(
          opts.messagingRepository,
          parsed.data.conversationId,
          userId,
          parsed.data.lastReadMessageId
        );
        const payload = {
          conversationId: receipt.conversationId,
          userId: receipt.userId,
          lastReadMessageId: receipt.lastReadMessageId,
          lastReadAt: receipt.lastReadAt.toISOString(),
        };
        io.to(room(parsed.data.conversationId)).emit(REALTIME_EVENTS.receiptRead, payload);
        ack?.(payload);
      } catch (err) {
        if (err instanceof ConversationNotFoundError) {
          return fail('CONVERSATION_NOT_FOUND', 'این گفت‌وگو یافت نشد.');
        }
        fail('RECEIPT_REJECTED', 'ثبت وضعیت خواندن ممکن نشد.');
      }
    });

    /**
     * Typing lives in Redis under a short TTL and is never written to the
     * database - it is a hint about the next few seconds, not a record of
     * anything, and storing it would turn private behaviour into history.
     * The TTL also means a client that closes its laptop mid-sentence stops
     * "typing" on its own, with no stop event and no cleanup.
     */
    async function setTyping(conversationId: string, typing: boolean) {
      if (!(await requireMember(conversationId))) return;

      if (opts.redis) {
        const key = typingKey(conversationId, userId);
        if (typing) await opts.redis.set(key, '1', 'EX', TYPING_TTL_SECONDS);
        else await opts.redis.del(key);
      }

      socket.to(room(conversationId)).emit(REALTIME_EVENTS.typing, { conversationId, userId, typing });
    }

    socket.on(REALTIME_EVENTS.typingStart, async (raw: unknown) => {
      const parsed = socketTypingSchema.safeParse(raw);
      if (!parsed.success) return fail('VALIDATION_ERROR', 'داده ارسالی معتبر نیست.');
      await setTyping(parsed.data.conversationId, true);
    });

    socket.on(REALTIME_EVENTS.typingStop, async (raw: unknown) => {
      const parsed = socketTypingSchema.safeParse(raw);
      if (!parsed.success) return fail('VALIDATION_ERROR', 'داده ارسالی معتبر نیست.');
      await setTyping(parsed.data.conversationId, false);
    });
  });

  // The sweep is what turns a revocation into a closed connection. Without
  // it, logging out would leave every open socket streaming until the
  // process restarted.
  const sweep = setInterval(() => {
    void (async () => {
      for (const socket of await io.fetchSockets()) {
        const { userId } = socket.data as SocketUser;
        try {
          if (!(await opts.sessionLiveness.hasLiveSession(userId))) {
            socket.emit(REALTIME_EVENTS.error, { code: 'SESSION_REVOKED', message: 'نشست شما پایان یافته است.' });
            socket.disconnect(true);
          }
        } catch {
          // A database blip must not disconnect everyone; the next sweep
          // will try again.
        }
      }
    })();
  }, sweepInterval);
  // Never hold the process open for the sake of the sweep.
  sweep.unref?.();

  // Socket.IO has no 'close' event to hook, so the timer is cleared by
  // wrapping close() itself. Without this a closed gateway would leave its
  // sweep running, which in tests means a timer firing against a shut-down
  // server after the test that owned it has finished.
  const originalClose = io.close.bind(io);
  io.close = ((callback?: (err?: Error) => void) => {
    clearInterval(sweep);
    return originalClose(callback);
  }) as typeof io.close;

  return io;
}
