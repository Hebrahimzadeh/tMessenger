'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  notificationListResponseSchema,
  notificationPreferencesSchema,
  type NotificationType,
  type NotificationView,
} from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';

const TYPE_LABELS: Record<NotificationType, string> = {
  NEW_PUBLIC_REPLY: 'پاسخ تازه در گفت‌وگوی عمومی',
  RESERVATION_CHANGED: 'وضعیت رزرو تغییر کرد',
  NEW_PRIVATE_MESSAGE: 'پیام خصوصی تازه',
  MODERATION_UPDATE: 'به‌روزرسانی رسیدگی',
  SPACE_GUIDANCE: 'راهنمایی تازه برای بستر',
};

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready' };

/**
 * Everything waiting for one person, newest first.
 *
 * A notification says what happened and links to where it happened; the only
 * content it ever shows is the private-message preview, which the server
 * resolves from the message at request time and which this person can switch
 * off. So the toggle lives right here rather than buried in a settings page -
 * the place you notice you would rather not see excerpts is the place you are
 * looking at one.
 */
export function NotificationCenter() {
  const [items, setItems] = useState<NotificationView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showPreviews, setShowPreviews] = useState(true);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [busy, setBusy] = useState(false);

  const fetchPage = useCallback(async (cursor?: string) => {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    const page = notificationListResponseSchema.parse(await apiFetch(`/me/notifications${query}`));
    setItems((prev) => (cursor ? [...prev, ...page.items] : page.items));
    setNextCursor(page.nextCursor);
    setUnreadCount(page.unreadCount);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [, prefs] = await Promise.all([
          fetchPage(),
          apiFetch('/me/notification-preferences').then((raw) => notificationPreferencesSchema.parse(raw)),
        ]);
        if (!cancelled) {
          setShowPreviews(prefs.privateMessagePreview);
          setState({ status: 'ready' });
        }
      } catch (err) {
        if (!cancelled) {
          setState({ status: 'error', message: err instanceof ApiError ? err.message : 'بارگذاری اعلان‌ها ممکن نشد.' });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  async function markAllRead() {
    setBusy(true);
    try {
      await apiFetch('/me/notifications/read', { method: 'POST', body: JSON.stringify({ all: true }) });
      const now = new Date().toISOString();
      setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
      setUnreadCount(0);
    } finally {
      setBusy(false);
    }
  }

  async function togglePreviews(next: boolean) {
    setShowPreviews(next);
    const prefs = notificationPreferencesSchema.parse(
      await apiFetch('/me/notification-preferences', {
        method: 'PATCH',
        body: JSON.stringify({ privateMessagePreview: next }),
      })
    );
    setShowPreviews(prefs.privateMessagePreview);
    // Re-read so any previews already on screen disappear straight away
    // rather than lingering until the next visit.
    await fetchPage();
  }

  if (state.status === 'loading') {
    return <p className="p-6 text-center text-[14px] text-gray-500">در حال بارگذاری اعلان‌ها…</p>;
  }
  if (state.status === 'error') {
    return (
      <p role="alert" className="m-4 rounded-xl border border-red-200 bg-red-50 p-3 text-[14px] text-red-700">
        {state.message}
      </p>
    );
  }

  return (
    <div dir="rtl" className="min-h-full bg-white text-right">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <h1 className="text-[16px] font-bold text-gray-900">
          اعلان‌ها
          {unreadCount > 0 && (
            <span data-testid="unread-total" className="mr-2 rounded-full bg-[#4CAF50] px-2 py-0.5 text-[11px] text-white">
              {unreadCount}
            </span>
          )}
        </h1>
        <button
          type="button"
          onClick={() => void markAllRead()}
          disabled={busy || unreadCount === 0}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-[13px] text-gray-700 disabled:opacity-50"
        >
          خواندن همه
        </button>
      </div>

      <label className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <span className="min-w-0">
          <span className="block text-[14px] text-gray-900">نمایش خلاصهٔ پیام خصوصی</span>
          <span className="block text-[12px] leading-relaxed text-gray-500">
            وقتی خاموش باشد باز هم خبردار می‌شوید که کسی پیام داده، ولی متن آن اینجا نشان داده نمی‌شود.
          </span>
        </span>
        <input
          type="checkbox"
          checked={showPreviews}
          aria-label="نمایش خلاصهٔ پیام خصوصی"
          onChange={(event) => void togglePreviews(event.target.checked)}
          className="h-5 w-5 shrink-0 accent-[#527DA3]"
        />
      </label>

      {items.length === 0 ? (
        <p className="p-8 text-center text-[14px] text-gray-500">اعلانی ندارید.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {items.map((notification) => (
            <li key={notification.id}>
              <Link
                href={notification.deepLink}
                data-testid="notification"
                data-type={notification.type}
                data-read={notification.readAt ? 'true' : 'false'}
                className={`block px-4 py-3 transition hover:bg-gray-50 ${notification.readAt ? '' : 'bg-blue-50/40'}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[14px] font-medium text-gray-900">{TYPE_LABELS[notification.type]}</span>
                  <span className="shrink-0 text-[11px] text-gray-400">{formatWhen(notification.createdAt)}</span>
                </div>
                {notification.preview && (
                  <p data-testid="notification-preview" className="mt-0.5 truncate text-[13px] text-gray-600">
                    {notification.preview}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {nextCursor && (
        <div className="p-4">
          <button
            type="button"
            onClick={() => void fetchPage(nextCursor)}
            className="w-full rounded-xl border border-gray-300 py-2 text-[14px] text-gray-700"
          >
            بیشتر
          </button>
        </div>
      )}
    </div>
  );
}
