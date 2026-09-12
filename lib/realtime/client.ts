'use client';

import { io, type Socket } from 'socket.io-client';
import {
  messageListResponseSchema,
  messageViewSchema,
  REALTIME_EVENTS,
  typingNoticeSchema,
  type MessageView,
  type TypingNotice,
} from '@taavon/contracts';
import { apiBaseUrl, apiFetch } from '@/lib/api/client';

export interface RealtimeHandlers {
  onMessage: (message: MessageView) => void;
  onTyping?: (notice: TypingNotice) => void;
  onReceipt?: (receipt: { conversationId: string; userId: string; lastReadMessageId: string | null }) => void;
  /** Fired when the server refuses something - most importantly SESSION_REVOKED. */
  onError?: (error: { code: string; message: string }) => void;
  /** Fired after a reconnect, once the messages missed while away have been fetched. */
  onCaughtUp?: (missed: MessageView[]) => void;
}

/**
 * The socket's origin. The API base URL is `/api/v1` behind the proxy, so
 * the socket connects to the page's own origin and the proxy forwards
 * `/socket.io/*` to the API. Pointed straight at the API in development,
 * where the two run on different ports.
 */
function socketOrigin(): string {
  const base = apiBaseUrl();
  if (base.startsWith('/')) return window.location.origin;
  return new URL(base).origin;
}

export interface RealtimeConnection {
  join: (conversationId: string) => void;
  send: (conversationId: string, body: string) => string;
  markRead: (conversationId: string, lastReadMessageId: string) => void;
  setTyping: (conversationId: string, typing: boolean) => void;
  disconnect: () => void;
  readonly socket: Socket;
}

/**
 * Opens the realtime connection for one signed-in person.
 *
 * Two things here are worth knowing about.
 *
 * The session cookie authenticates the handshake, so `withCredentials` is
 * required; there is no token in the query string, which would otherwise end
 * up in proxy and server logs.
 *
 * On reconnect the client does not trust the socket to have buffered
 * anything. It asks REST for everything newer than the last message it saw,
 * which is the only way to close the window where the connection was down -
 * "reconnect با cursor پیام‌های ازدست‌رفته را REST می‌گیرد". Resends carry the
 * same `clientMessageId`, so a message that did land during the outage is
 * not written twice.
 */
export function connectRealtime(handlers: RealtimeHandlers): RealtimeConnection {
  const socket = io(socketOrigin(), {
    path: '/socket.io/',
    withCredentials: true,
    transports: ['websocket', 'polling'],
  });

  const joined = new Set<string>();
  /** The newest message seen per conversation, so a reconnect knows where to resume. */
  const lastSeen = new Map<string, string>();

  socket.on(REALTIME_EVENTS.messageCreated, (raw: unknown) => {
    const parsed = messageViewSchema.safeParse(raw);
    if (!parsed.success) return;
    lastSeen.set(parsed.data.conversationId, parsed.data.createdAt);
    handlers.onMessage(parsed.data);
  });

  socket.on(REALTIME_EVENTS.typing, (raw: unknown) => {
    const parsed = typingNoticeSchema.safeParse(raw);
    if (parsed.success) handlers.onTyping?.(parsed.data);
  });

  socket.on(REALTIME_EVENTS.receiptRead, (raw: unknown) => {
    const receipt = raw as { conversationId?: unknown; userId?: unknown; lastReadMessageId?: unknown };
    if (typeof receipt?.conversationId === 'string' && typeof receipt?.userId === 'string') {
      handlers.onReceipt?.({
        conversationId: receipt.conversationId,
        userId: receipt.userId,
        lastReadMessageId: typeof receipt.lastReadMessageId === 'string' ? receipt.lastReadMessageId : null,
      });
    }
  });

  socket.on(REALTIME_EVENTS.error, (raw: unknown) => {
    const err = raw as { code?: unknown; message?: unknown };
    handlers.onError?.({
      code: typeof err?.code === 'string' ? err.code : 'REALTIME_ERROR',
      message: typeof err?.message === 'string' ? err.message : 'ارتباط لحظه‌ای با خطا مواجه شد.',
    });
  });

  socket.on('connect_error', (err: Error) => {
    handlers.onError?.({ code: err.message, message: 'اتصال لحظه‌ای برقرار نشد.' });
  });

  socket.on('connect', () => {
    // Rejoin every room, then close the gap. Order matters: joining first
    // means anything sent *during* the catch-up still arrives live.
    for (const conversationId of joined) {
      socket.emit(REALTIME_EVENTS.join, { conversationId });
    }
    void catchUp();
  });

  async function catchUp() {
    const missed: MessageView[] = [];

    for (const conversationId of joined) {
      try {
        const response = messageListResponseSchema.parse(
          await apiFetch(`/conversations/${conversationId}/messages`)
        );
        const since = lastSeen.get(conversationId);
        // The list is newest-first, so everything up to the last message
        // already seen is what was missed.
        for (const message of response.items) {
          if (since && message.createdAt <= since) break;
          missed.push(message);
        }
      } catch {
        // Offline again already; the next connect will retry the same way.
      }
    }

    missed.reverse();
    for (const message of missed) {
      lastSeen.set(message.conversationId, message.createdAt);
      handlers.onMessage(message);
    }
    handlers.onCaughtUp?.(missed);
  }

  return {
    socket,

    join(conversationId) {
      joined.add(conversationId);
      socket.emit(REALTIME_EVENTS.join, { conversationId });
    },

    /**
     * Returns the `clientMessageId` it generated, so the caller can draw the
     * message optimistically and replace it when the server echoes the same
     * id back.
     */
    send(conversationId, body) {
      const clientMessageId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `cm-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      socket.emit(REALTIME_EVENTS.messageSend, { conversationId, body, clientMessageId });
      return clientMessageId;
    },

    markRead(conversationId, lastReadMessageId) {
      socket.emit(REALTIME_EVENTS.receiptRead, { conversationId, lastReadMessageId });
    },

    setTyping(conversationId, typing) {
      socket.emit(typing ? REALTIME_EVENTS.typingStart : REALTIME_EVENTS.typingStop, { conversationId });
    },

    disconnect() {
      socket.disconnect();
    },
  };
}
