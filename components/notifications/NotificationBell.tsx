'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { notificationListResponseSchema } from '@taavon/contracts';
import { Bell } from '@/components/icons';
import { apiFetch } from '@/lib/api/client';

/** How often the badge re-checks. The list itself is authoritative; this is only the count. */
const POLL_MS = 30_000;

/**
 * The unread badge in the header.
 *
 * Polls rather than subscribes, deliberately: the socket carries private
 * messages, and a notification count covering public replies, reservations and
 * moderation has no business riding on that connection. Thirty seconds is slow
 * enough to cost nothing and fast enough that the number is never meaningfully
 * stale for something you would go and read anyway.
 */
export function NotificationBell() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const page = notificationListResponseSchema.parse(await apiFetch('/me/notifications'));
        if (!cancelled) setUnread(page.unreadCount);
      } catch {
        // Signed out, or offline. The badge simply does not update.
      }
    }

    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <Link href="/notifications" aria-label="اعلان‌ها" className="relative rounded-full p-2 hover:bg-white/10">
      <Bell size={20} />
      {unread > 0 && (
        <span
          data-testid="notification-badge"
          className="absolute -top-0.5 left-0 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-[#4CAF50] px-1 text-[10px] font-bold text-white"
        >
          {unread > 99 ? '۹۹+' : unread}
        </span>
      )}
    </Link>
  );
}
