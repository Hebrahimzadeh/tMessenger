'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { participationListResponseSchema, type ParticipationItem } from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';

const TYPE_LABELS: Record<ParticipationItem['type'], string> = {
  PRODUCED: 'کارتی ساختید',
  MEANINGFUL_VIEW: 'کارتی را دیدید',
  PUBLIC_CONTRIBUTION: 'در گفت‌وگوی عمومی مشارکت کردید',
  RESERVED: 'کارتی را رزرو کردید',
  PRIVATE_CHAT_STARTED: 'گفت‌وگوی خصوصی آغاز شد',
  APPLIED: 'به نقشی پیوستید',
  RESERVATION_CLOSED: 'رزروی بسته شد',
};

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready' };

/**
 * "صفحهٔ مشارکت‌های من timeline خصوصی و pagination زمانی داشته باشد؛
 * filter chip، tab دسته، search، score، summary یا «اقدام باز» نساز" -
 * this renders exactly a reverse-chronological list of {label, time,
 * deep-link} and a "load more" button, nothing else: no filter/category
 * control, no search box, no score or summary line, no "open action"
 * affordance. Only the API's own two params (`limit`/`cursor`) exist here
 * for a reason to even build one of those controls.
 */
export function ParticipationTimeline() {
  const [items, setItems] = useState<ParticipationItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(async (cursor?: string) => {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    const page = participationListResponseSchema.parse(await apiFetch(`/me/participations${query}`));
    setItems((prev) => (cursor ? [...prev, ...page.items] : page.items));
    setNextCursor(page.nextCursor);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await fetchPage();
        if (!cancelled) setState({ status: 'ready' });
      } catch (err) {
        if (!cancelled) {
          setState({ status: 'error', message: err instanceof ApiError ? err.message : 'بارگذاری مشارکت‌ها ممکن نشد.' });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      await fetchPage(nextCursor);
    } catch (err) {
      setState({ status: 'error', message: err instanceof ApiError ? err.message : 'بارگذاری موارد بیشتر ممکن نشد.' });
    } finally {
      setLoadingMore(false);
    }
  }

  if (state.status === 'loading') {
    return (
      <p role="status" className="p-6 text-center text-gray-500">
        در حال بارگذاری...
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <p role="alert" className="p-6 text-center text-red-700">
        {state.message}
      </p>
    );
  }

  return (
    <div dir="rtl" className="mx-auto max-w-xl p-4 text-right">
      <h1 className="mb-4 text-lg font-semibold text-gray-900">مشارکت‌های من</h1>

      {items.length === 0 ? (
        <p className="text-sm text-gray-500">هنوز مشارکتی ثبت نشده است.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item, index) => {
            const content = (
              <>
                <span className="text-sm text-gray-900">{TYPE_LABELS[item.type]}</span>
                <time className="block text-xs text-gray-400" dateTime={item.createdAt}>
                  {formatWhen(item.createdAt)}
                </time>
              </>
            );
            return (
              <li key={index} className="rounded-xl border border-gray-200 p-3">
                {item.deepLink ? (
                  <Link href={item.deepLink} className="block">
                    {content}
                  </Link>
                ) : (
                  content
                )}
              </li>
            );
          })}
        </ul>
      )}

      {nextCursor && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="mt-3 w-full rounded-xl border border-gray-200 py-2 text-sm text-gray-600 disabled:opacity-50"
        >
          {loadingMore ? 'در حال بارگذاری...' : 'نمایش موارد قدیمی‌تر'}
        </button>
      )}
    </div>
  );
}
