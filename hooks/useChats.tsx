'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  conversationListResponseSchema,
  conversationViewSchema,
  messageListResponseSchema,
  messageViewSchema,
  type ConversationView,
  type MessageView,
} from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';
import { connectRealtime, type RealtimeConnection, type RealtimeHandlers } from '@/lib/realtime/client';

/**
 * How a message this client sent is doing. Only ever set on our own
 * messages, and only while there is something to say about them: once the
 * server has echoed one back it is simply a message like any other.
 */
export type SendState = 'pending' | 'failed';

export interface ChatMessage extends MessageView {
  sendState?: SendState;
}

/** How long a send waits for the server's echo before it is called failed. */
export const SEND_TIMEOUT_MS = 10_000;

export interface ChatsContextValue {
  conversations: ConversationView[];
  loading: boolean;
  error: string | null;
  /** Null until a conversation's history has been fetched at least once. */
  messagesFor: (conversationId: string) => ChatMessage[] | null;
  conversation: (conversationId: string) => ConversationView | undefined;
  open: (conversationId: string) => void;
  send: (conversationId: string, body: string) => void;
  retry: (conversationId: string, clientMessageId: string) => void;
  markRead: (conversationId: string) => void;
  setPreferences: (conversationId: string, prefs: { muted?: boolean; hidden?: boolean }) => Promise<void>;
  decideProposal: (messageId: string, decision: 'CONFIRM' | 'REJECT') => Promise<void>;
  typingIn: (conversationId: string) => string[];
  setTyping: (conversationId: string, typing: boolean) => void;
  /** The caller's own id, so a bubble knows which side it belongs on. */
  meId: string | null;
}

const ChatsContext = createContext<ChatsContextValue | null>(null);

export interface ChatsProviderProps {
  children: ReactNode;
  meId: string | null;
  /** Test seam - the real one opens a socket. */
  connect?: (handlers: RealtimeHandlers) => RealtimeConnection;
}

function newClientMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `cm-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ChatsProvider({ children, meId, connect = connectRealtime }: ChatsProviderProps) {
  const [conversations, setConversations] = useState<ConversationView[]>([]);
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({});
  const [typing, setTypingState] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const realtime = useRef<RealtimeConnection | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  /**
   * Replaces an optimistic message with the server's version, matched on the
   * id this client generated. Anything else is appended. This is the whole of
   * "optimistic message را با clientMessageId reconciliation کن": the sender
   * sees their own message immediately, and when the authoritative one
   * arrives it takes the optimistic one's place rather than sitting beside it.
   */
  const applyMessage = useCallback((incoming: MessageView) => {
    setMessages((prev) => {
      const list = prev[incoming.conversationId] ?? [];
      const optimisticAt = incoming.clientMessageId
        ? list.findIndex((m) => m.clientMessageId === incoming.clientMessageId)
        : -1;
      const existingAt = list.findIndex((m) => m.id === incoming.id);

      if (optimisticAt !== -1) {
        const next = [...list];
        next[optimisticAt] = incoming;
        return { ...prev, [incoming.conversationId]: next };
      }
      if (existingAt !== -1) {
        const next = [...list];
        next[existingAt] = incoming;
        return { ...prev, [incoming.conversationId]: next };
      }
      return { ...prev, [incoming.conversationId]: [...list, incoming] };
    });

    if (incoming.clientMessageId) {
      const timer = timers.current.get(incoming.clientMessageId);
      if (timer) {
        clearTimeout(timer);
        timers.current.delete(incoming.clientMessageId);
      }
    }
  }, []);

  const markFailed = useCallback((conversationId: string, clientMessageId: string) => {
    setMessages((prev) => {
      const list = prev[conversationId] ?? [];
      return {
        ...prev,
        [conversationId]: list.map((m) =>
          m.clientMessageId === clientMessageId && m.sendState === 'pending' ? { ...m, sendState: 'failed' } : m
        ),
      };
    });
  }, []);

  useEffect(() => {
    if (!meId) return;
    let cancelled = false;

    (async () => {
      try {
        const page = conversationListResponseSchema.parse(await apiFetch('/conversations'));
        if (!cancelled) setConversations(page.items);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'بارگذاری گفت‌وگوها ممکن نشد.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const connection = connect({
      onMessage: applyMessage,
      onTyping: ({ conversationId, userId, typing: isTyping }) => {
        setTypingState((prev) => {
          const current = prev[conversationId] ?? [];
          const next = isTyping ? [...new Set([...current, userId])] : current.filter((id) => id !== userId);
          return { ...prev, [conversationId]: next };
        });
      },
      onError: ({ message }) => setError(message),
    });
    realtime.current = connection;

    // Captured here rather than read in the cleanup: by the time cleanup
    // runs the ref may already point somewhere else.
    const pendingTimers = timers.current;

    return () => {
      cancelled = true;
      for (const timer of pendingTimers.values()) clearTimeout(timer);
      pendingTimers.clear();
      connection.disconnect();
      realtime.current = null;
    };
  }, [meId, connect, applyMessage]);

  const open = useCallback(
    (conversationId: string) => {
      realtime.current?.join(conversationId);
      setMessages((prev) => (prev[conversationId] ? prev : { ...prev, [conversationId]: [] }));

      // A hidden thread is absent from the list but still reachable, so the
      // room cannot assume the list already describes it. Fetched here so an
      // assistant thread someone hid still opens as the assistant.
      void (async () => {
        try {
          const one = conversationViewSchema.parse(await apiFetch(`/conversations/${conversationId}`));
          setConversations((prev) =>
            prev.some((c) => c.id === one.id) ? prev.map((c) => (c.id === one.id ? one : c)) : [...prev, one]
          );
        } catch {
          // Not a member, or offline; the room renders its loading state.
        }
      })();

      void (async () => {
        try {
          const page = messageListResponseSchema.parse(await apiFetch(`/conversations/${conversationId}/messages`));
          // The API returns newest-first; the room reads oldest-first.
          const ordered = [...page.items].reverse();
          setMessages((prev) => {
            const pending = (prev[conversationId] ?? []).filter((m) => m.sendState);
            return { ...prev, [conversationId]: [...ordered, ...pending] };
          });
        } catch (err) {
          setError(err instanceof ApiError ? err.message : 'بارگذاری پیام‌ها ممکن نشد.');
        }
      })();
    },
    []
  );

  const dispatchSend = useCallback(
    (conversationId: string, body: string, clientMessageId: string) => {
      timers.current.set(
        clientMessageId,
        setTimeout(() => markFailed(conversationId, clientMessageId), SEND_TIMEOUT_MS)
      );
      realtime.current?.sendWithId(conversationId, body, clientMessageId);
    },
    [markFailed]
  );

  const send = useCallback(
    (conversationId: string, body: string) => {
      const trimmed = body.trim();
      if (!trimmed || !meId) return;
      const clientMessageId = newClientMessageId();
      const now = new Date().toISOString();

      const optimistic: ChatMessage = {
        id: clientMessageId,
        conversationId,
        senderId: meId,
        senderKind: 'USER',
        status: 'VISIBLE',
        body: trimmed,
        revisionCount: 1,
        edited: false,
        clientMessageId,
        proposedAction: null,
        proposalState: 'NONE',
        createdAt: now,
        updatedAt: now,
        sendState: 'pending',
      };

      setMessages((prev) => ({ ...prev, [conversationId]: [...(prev[conversationId] ?? []), optimistic] }));
      dispatchSend(conversationId, trimmed, clientMessageId);
    },
    [meId, dispatchSend]
  );

  /**
   * Sends the same message again under the same id. The server's unique index
   * on (conversation, clientMessageId) means a retry of something that did
   * land returns the original rather than writing a second copy, so pressing
   * retry is always safe even when the first attempt actually succeeded.
   */
  const retry = useCallback(
    (conversationId: string, clientMessageId: string) => {
      const message = (messages[conversationId] ?? []).find((m) => m.clientMessageId === clientMessageId);
      if (!message?.body) return;

      setMessages((prev) => ({
        ...prev,
        [conversationId]: (prev[conversationId] ?? []).map((m) =>
          m.clientMessageId === clientMessageId ? { ...m, sendState: 'pending' } : m
        ),
      }));
      dispatchSend(conversationId, message.body, clientMessageId);
    },
    [messages, dispatchSend]
  );

  const markRead = useCallback(
    (conversationId: string) => {
      const list = messages[conversationId] ?? [];
      const newest = [...list].reverse().find((m) => !m.sendState && m.senderId !== meId);
      if (!newest) return;
      realtime.current?.markRead(conversationId, newest.id);
      setConversations((prev) => prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c)));
    },
    [messages, meId]
  );

  const setPreferences = useCallback(async (conversationId: string, prefs: { muted?: boolean; hidden?: boolean }) => {
    const updated = conversationViewSchema.parse(
      await apiFetch(`/conversations/${conversationId}/preferences`, {
        method: 'PATCH',
        body: JSON.stringify(prefs),
      })
    );
    setConversations((prev) =>
      updated.hidden
        ? prev.filter((c) => c.id !== updated.id)
        : prev.map((c) => (c.id === updated.id ? updated : c))
    );
  }, []);

  const decideProposal = useCallback(async (messageId: string, decision: 'CONFIRM' | 'REJECT') => {
    const updated = messageViewSchema.parse(
      await apiFetch(`/messages/${messageId}/proposal`, { method: 'POST', body: JSON.stringify({ decision }) })
    );
    applyMessage(updated);
  }, [applyMessage]);

  const setTyping = useCallback((conversationId: string, isTyping: boolean) => {
    realtime.current?.setTyping(conversationId, isTyping);
  }, []);

  const value = useMemo<ChatsContextValue>(
    () => ({
      conversations,
      loading,
      error,
      messagesFor: (id) => messages[id] ?? null,
      conversation: (id) => conversations.find((c) => c.id === id),
      open,
      send,
      retry,
      markRead,
      setPreferences,
      decideProposal,
      typingIn: (id) => typing[id] ?? [],
      setTyping,
      meId,
    }),
    [conversations, messages, typing, loading, error, open, send, retry, markRead, setPreferences, decideProposal, setTyping, meId]
  );

  return <ChatsContext.Provider value={value}>{children}</ChatsContext.Provider>;
}

export function useChats(): ChatsContextValue {
  const ctx = useContext(ChatsContext);
  if (!ctx) throw new Error('useChats must be used within a ChatsProvider');
  return ctx;
}
