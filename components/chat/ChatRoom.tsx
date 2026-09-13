'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Bot, BellOff, Bell, EyeOff } from '@/components/icons';
import { useChats, type ChatMessage } from '@/hooks/useChats';
import { MessageBubble } from './MessageBubble';
import { ChatComposer } from './ChatComposer';
import { ChatContextMenu, type ChatContextMenuAction } from './ChatContextMenu';

export interface ChatRoomProps {
  conversationId: string;
}

/**
 * One conversation.
 *
 * The layout follows the pattern people already know from every messenger:
 * a header with back and who you are talking to, the thread scrolling under
 * it, the composer pinned to the bottom, long-press for actions on a message.
 * That familiarity is the point - it is the one thing here nobody should have
 * to learn. None of Telegram's own assets, colours, wording or marks are
 * used; the pattern is shared, the surface is this project's own.
 */
export function ChatRoom({ conversationId }: ChatRoomProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { conversation, messagesFor, open, send, retry, markRead, setPreferences, decideProposal, typingIn, setTyping, meId } =
    useChats();

  const [replyingTo, setReplyingTo] = useState<{ id: string; body: string | null } | null>(null);
  const [menuFor, setMenuFor] = useState<ChatMessage | null>(null);
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = messagesFor(conversationId);
  const room = conversation(conversationId);
  const assistant = room?.kind === 'SYSTEM_ASSISTANT';

  /**
   * Where "back" goes. A reservation deep-links here with the card it came
   * from, and back must return there rather than dropping the person in the
   * chats tab - "back کاربر را به کارت مبدأ برگرداند".
   */
  const from = searchParams.get('from');

  useEffect(() => {
    open(conversationId);
  }, [conversationId, open]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages?.length]);

  // Marking read is driven by the thread growing, and guarded by what was
  // last marked so a re-render cannot send the same receipt twice.
  const lastMarked = useRef<{ id: string; count: number }>({ id: '', count: -1 });
  const messageCount = messages?.length ?? 0;
  useEffect(() => {
    if (messageCount === 0) return;
    if (lastMarked.current.id === conversationId && lastMarked.current.count === messageCount) return;
    lastMarked.current = { id: conversationId, count: messageCount };
    markRead(conversationId);
  }, [conversationId, messageCount, markRead]);

  const byId = useMemo(() => new Map((messages ?? []).map((m) => [m.id, m])), [messages]);
  const typingPeers = typingIn(conversationId).filter((id) => id !== meId);

  function goBack() {
    if (from) router.push(from);
    else router.back();
  }

  function menuActions(message: ChatMessage): ChatContextMenuAction[] {
    const mine = message.senderId === meId;
    const actions: ChatContextMenuAction[] = [
      {
        id: 'reply',
        label: 'پاسخ',
        onSelect: () => setReplyingTo({ id: message.id, body: message.body }),
      },
    ];
    if (message.body) {
      actions.push({
        id: 'copy',
        label: 'رونوشت',
        onSelect: () => void navigator.clipboard?.writeText(message.body ?? ''),
      });
    }
    if (mine && message.status !== 'DELETED' && !message.sendState) {
      actions.push({ id: 'delete', label: 'حذف برای همه', destructive: true, onSelect: () => void deleteMessage(message.id) });
    }
    return actions;
  }

  async function deleteMessage(messageId: string) {
    const { apiFetch } = await import('@/lib/api/client');
    await apiFetch(`/messages/${messageId}`, { method: 'DELETE' });
    open(conversationId);
  }

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-[#E4DDD6]">
      <header className="flex shrink-0 items-center gap-3 bg-[#527DA3] px-2 py-2 text-white shadow-sm">
        <button type="button" onClick={goBack} aria-label="بازگشت" className="rounded-full p-2 hover:bg-white/10">
          <ArrowRight size={22} />
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-medium ${
              assistant ? 'bg-[#3F6B57]' : 'border border-white/20 bg-[#6490B1]'
            }`}
          >
            {assistant ? <Bot size={20} /> : (room?.members.find((m) => m.userId !== meId)?.userId ?? '؟').slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 truncate font-medium leading-tight">
              {assistant ? 'همیار تعاون' : 'گفت‌وگوی خصوصی'}
              {assistant && (
                <span className="shrink-0 rounded-md bg-white/20 px-1.5 py-0.5 text-[10px] font-medium">حساب سیستمی</span>
              )}
            </h2>
            <p className="truncate text-xs text-blue-100">
              {typingPeers.length > 0 ? 'در حال نوشتن…' : assistant ? 'دستیار خودکار، نه یک انسان' : 'گفت‌وگوی خصوصی'}
            </p>
          </div>
        </div>

        {room && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label={room.muted ? 'باصدا کردن' : 'بی‌صدا کردن'}
              onClick={() => void setPreferences(conversationId, { muted: !room.muted })}
              className="rounded-full p-2 hover:bg-white/10"
            >
              {room.muted ? <BellOff size={19} /> : <Bell size={19} />}
            </button>
            <button
              type="button"
              aria-label="پنهان کردن از فهرست"
              onClick={async () => {
                await setPreferences(conversationId, { hidden: true });
                goBack();
              }}
              className="rounded-full p-2 hover:bg-white/10"
            >
              <EyeOff size={19} />
            </button>
          </div>
        )}
      </header>

      {assistant && (
        <div className="shrink-0 border-b border-[#3F6B57]/20 bg-[#3F6B57]/5 px-3 py-2">
          <p className="text-[12px] leading-relaxed text-[#2F5041]">
            همیار یک حساب سیستمی است، نه مدیر و نه یک انسان. پیشنهادهایش تا وقتی خودتان تأیید نکنید اجرا نمی‌شود، و به
            گفت‌وگوهای خصوصی شما با دیگران دسترسی ندارد.
          </p>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3 sm:p-4">
        {messages === null && <p className="py-6 text-center text-[13px] text-gray-600">در حال بارگذاری…</p>}
        {messages?.length === 0 && (
          <p className="py-6 text-center text-[13px] text-gray-600">هنوز پیامی در این گفت‌وگو نیست.</p>
        )}
        {messages?.map((message) => {
          const replySource = null; // Reply targets render from the composer preview until Task 22 threads them server-side.
          return (
            <MessageBubble
              key={message.clientMessageId ?? message.id}
              message={message}
              mine={message.senderId === meId}
              replyTo={replySource}
              onRetry={() => message.clientMessageId && retry(conversationId, message.clientMessageId)}
              onLongPress={() => setMenuFor(message)}
              onDecideProposal={(decision) => void decideProposal(message.id, decision)}
              onEditProposal={() => setDraft(message.proposedAction?.summary ?? '')}
            />
          );
        })}
        {typingPeers.length > 0 && (
          <p data-testid="typing-indicator" className="pr-1 text-[12px] text-gray-600">
            در حال نوشتن…
          </p>
        )}
      </div>

      <ChatComposer
        key={`${conversationId}:${draft ?? ''}`}
        onSend={(body) => {
          send(conversationId, body);
          setReplyingTo(null);
          setDraft(undefined);
        }}
        onTypingChange={(typing) => setTyping(conversationId, typing)}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        initialText={draft ?? ''}
      />

      {menuFor && <ChatContextMenu actions={menuActions(menuFor)} onClose={() => setMenuFor(null)} />}

      {/* byId exists so a future reply render can resolve its target without another fetch. */}
      <span hidden data-message-count={byId.size} />
    </div>
  );
}
