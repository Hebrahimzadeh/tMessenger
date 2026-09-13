'use client';

import { useRouter } from 'next/navigation';
import { Bot, BellOff } from '@/components/icons';
import type { ConversationView } from '@taavon/contracts';
import { useChats } from '@/hooks/useChats';

function timeLabel(iso: string | null): string {
  if (!iso) return '';
  const when = new Date(iso);
  const today = new Date();
  const sameDay = when.toDateString() === today.toDateString();
  return new Intl.DateTimeFormat('fa-IR', sameDay ? { hour: '2-digit', minute: '2-digit' } : { month: 'short', day: 'numeric' }).format(when);
}

/**
 * The other person in a direct conversation, by id alone.
 *
 * The API deliberately hands over nothing but member ids - no name, avatar or
 * phone travels with a conversation - so a row shows a stable initial derived
 * from the id and nothing that could leak. Task 22's notification work is
 * where display names get resolved through the profile endpoints, which apply
 * each person's own privacy settings.
 */
function counterpartInitial(conversation: ConversationView, meId: string | null): string {
  const other = conversation.members.find((m) => m.userId !== meId) ?? conversation.members[0];
  return other ? other.userId.slice(0, 1).toUpperCase() : '؟';
}

export function ChatsList() {
  const router = useRouter();
  const { conversations: all, loading, error, meId } = useChats();
  // The hook also holds threads it fetched by id (a hidden one someone opened
  // directly); the list is the one place they must not reappear.
  const conversations = all.filter((c) => !c.hidden);

  if (loading) {
    return <p className="p-6 text-center text-[14px] text-gray-500">در حال بارگذاری گفت‌وگوها…</p>;
  }
  if (error) {
    return (
      <p role="alert" className="m-4 rounded-xl border border-red-200 bg-red-50 p-3 text-[14px] text-red-700">
        {error}
      </p>
    );
  }
  if (conversations.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-[15px] text-gray-700">هنوز گفت‌وگویی ندارید.</p>
        <p className="mt-1 text-[13px] leading-relaxed text-gray-500">
          گفت‌وگوی خصوصی از پروفایل یک نفر یا از رزرو یک کارت شروع می‌شود.
        </p>
      </div>
    );
  }

  return (
    <ul className="min-h-full divide-y divide-gray-100 bg-white">
      {conversations.map((conversation) => {
        const assistant = conversation.kind === 'SYSTEM_ASSISTANT';
        return (
          <li key={conversation.id}>
            <button
              type="button"
              data-testid="conversation-row"
              data-kind={conversation.kind}
              onClick={() => router.push(`/chats/${conversation.id}`)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-right transition hover:bg-gray-50 active:bg-gray-100"
            >
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-medium text-white ${
                  assistant ? 'bg-[#3F6B57]' : 'bg-gradient-to-t from-[#527DA3] to-blue-400'
                }`}
              >
                {assistant ? <Bot size={24} /> : counterpartInitial(conversation, meId)}
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <h3 className="truncate text-[15px] font-medium text-gray-900">
                      {assistant ? 'همیار تعاون' : 'گفت‌وگوی خصوصی'}
                    </h3>
                    {assistant && (
                      <span className="shrink-0 rounded-md bg-[#3F6B57]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#3F6B57]">
                        حساب سیستمی
                      </span>
                    )}
                    {conversation.muted && <BellOff size={13} className="shrink-0 text-gray-400" aria-label="بی‌صدا" />}
                  </span>
                  <span className="shrink-0 text-[11px] text-gray-400">{timeLabel(conversation.lastMessageAt)}</span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  {/* A timestamp, never a preview: the list must not put private text on a screen someone glances at. */}
                  <p className="truncate text-[13px] text-gray-500">
                    {conversation.lastMessageAt ? 'پیام جدید دارید' : 'هنوز پیامی رد و بدل نشده'}
                  </p>
                  {conversation.unreadCount > 0 && (
                    <span
                      data-testid="unread-badge"
                      className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white ${
                        conversation.muted ? 'bg-gray-400' : 'bg-[#4CAF50]'
                      }`}
                    >
                      {conversation.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
