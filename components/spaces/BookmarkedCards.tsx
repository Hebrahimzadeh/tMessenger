'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { CardListItem } from '@taavon/contracts';
import { cardListResponseSchema } from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';
import { useCurrentUserId } from '@/hooks/useCurrentUserId';
import { CardTemplate } from './CardTemplate';

/**
 * "نشان‌شده‌ها" - the cards this person kept, newest saved first.
 *
 * Their own list and nobody else's: the API needs a session even to read it,
 * and a card whose space stopped being public simply stops appearing without
 * the bookmark being deleted behind their back.
 */
export function BookmarkedCards() {
  const [cards, setCards] = useState<CardListItem[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentUser = useCurrentUserId();
  const currentUserId = currentUser.status === 'ready' ? currentUser.userId : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const page = cardListResponseSchema.parse(await apiFetch('/me/bookmarks'));
        if (!cancelled) {
          setCards(page.items);
          setNextCursor(page.nextCursor);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError && err.status === 401
              ? 'برای دیدن کارت‌های نشان‌شده وارد شوید.'
              : 'بارگذاری کارت‌های نشان‌شده ممکن نشد.'
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = cardListResponseSchema.parse(await apiFetch(`/me/bookmarks?cursor=${encodeURIComponent(nextCursor)}`));
      setCards((prev) => [...(prev ?? []), ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'بارگذاری کارت‌های بیشتر ممکن نشد.');
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div dir="rtl" className="mx-auto max-w-2xl p-4 text-right">
      <h1 className="mb-3 text-base font-semibold text-gray-900">نشان‌شده‌ها</h1>

      {error && (
        <p role="alert" className="mb-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {cards !== null && cards.length === 0 && !error && (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white/60 p-8 text-center text-sm text-gray-500">
          هنوز کارتی را نشان نکرده‌اید. هر کارت را می‌توانید از نوار پایینش نشان کنید تا بعداً پیدایش کنید.
        </div>
      )}

      {cards !== null && cards.length > 0 && (
        <ul>
          {cards.map((card) => (
            <li key={card.id}>
              <CardTemplate card={card} currentUserId={currentUserId} />
            </li>
          ))}
        </ul>
      )}

      {nextCursor && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="mb-3 w-full rounded-xl border border-gray-200 py-2 text-sm text-gray-600 disabled:opacity-50"
        >
          {loadingMore ? 'در حال بارگذاری...' : 'نمایش کارت‌های بیشتر'}
        </button>
      )}

      <Link href="/" className="text-sm text-blue-700 underline">
        بازگشت
      </Link>
    </div>
  );
}
