'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { conversationViewSchema } from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';

export interface StartPrivateChatButtonProps {
  /** The person whose profile this is. */
  userId: string;
}

/**
 * Opens a private conversation with the person whose profile this is -
 * "شروع چت از profile".
 *
 * Creating one is idempotent on the server (the same pair always resolves to
 * the same conversation), so pressing this twice, or pressing it months after
 * the first time, lands in the same thread rather than starting a second one.
 * It is also the whole interaction: no contact is added anywhere, no number
 * is exchanged, and nothing about either person is shared by the act of
 * opening a thread.
 */
export function StartPrivateChatButton({ userId }: StartPrivateChatButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const conversation = conversationViewSchema.parse(
        await apiFetch('/conversations', { method: 'POST', body: JSON.stringify({ withUserId: userId }) })
      );
      router.push(`/chats/${conversation.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'شروع گفت‌وگو ممکن نشد.');
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void start()}
        disabled={busy}
        className="w-full rounded-xl bg-[#527DA3] px-4 py-2.5 text-[14px] font-medium text-white disabled:opacity-60"
      >
        {busy ? 'در حال باز کردن…' : 'گفت‌وگوی خصوصی'}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
