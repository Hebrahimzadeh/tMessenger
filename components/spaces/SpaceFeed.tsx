'use client';

import { useEffect, useState } from 'react';
import type { CardListItem, SpaceCardHint } from '@taavon/contracts';
import { cardListResponseSchema } from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';
import { CardTemplate } from './CardTemplate';

export interface SpaceFeedProps {
  spaceId: string;
  cardHints: SpaceCardHint[] | null;
  /** What the space's own search box holds. Filters what is already loaded, the way a chat's in-conversation search does. */
  query?: string;
}

/**
 * The real, API-backed feed - real cards (Task 14+) now exist, fetched via
 * `GET /spaces/:id/cards` (ranked server-side, see card-ranking.ts) and
 * rendered through `CardTemplate`'s `variant: 'real'`. Example hints from
 * the space's own definition are still shown (`variant: 'example'`) as
 * inspiration underneath - always permanently badged and fully inert,
 * exactly as before, just delegated to `CardTemplate` so that rule lives
 * in one place instead of being duplicated between a hint-renderer and a
 * real-card-renderer.
 */
export function SpaceFeed({ spaceId, cardHints, query = '' }: SpaceFeedProps) {
  const [cards, setCards] = useState<CardListItem[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const page = cardListResponseSchema.parse(await apiFetch(`/spaces/${spaceId}/cards`));
        if (!cancelled) {
          setCards(page.items);
          setNextCursor(page.nextCursor);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'بارگذاری فید ممکن نشد.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [spaceId]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = cardListResponseSchema.parse(
        await apiFetch(`/spaces/${spaceId}/cards?cursor=${encodeURIComponent(nextCursor)}`)
      );
      setCards((prev) => [...(prev ?? []), ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'بارگذاری کارت‌های بیشتر ممکن نشد.');
    } finally {
      setLoadingMore(false);
    }
  }

  const needle = query.trim();
  const matches = (...fields: (string | undefined)[]) => needle.length === 0 || fields.some((f) => f?.includes(needle));
  const visibleCards = (cards ?? []).filter((card) => matches(card.title, card.body));
  const hints = (cardHints ?? []).filter((hint) => matches(hint.title, hint.description));
  const hasNothing = cards !== null && visibleCards.length === 0 && hints.length === 0;

  return (
    <div dir="rtl" className="text-right">
      {error && (
        <p role="alert" className="mb-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {hasNothing && (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white/60 p-8 text-center text-sm text-gray-500">
          {needle.length > 0 ? 'کارتی با این عبارت پیدا نشد.' : 'هنوز کارتی در این بستر ثبت نشده است. اولین کارت را شما بنویسید.'}
        </div>
      )}

      {visibleCards.length > 0 && (
        <ul>
          {visibleCards.map((card) => (
            <li key={card.id}>
              <CardTemplate variant="real" card={card} />
            </li>
          ))}
        </ul>
      )}

      {nextCursor && needle.length === 0 && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="mb-3 w-full rounded-xl border border-gray-200 py-2 text-sm text-gray-600 disabled:opacity-50"
        >
          {loadingMore ? 'در حال بارگذاری...' : 'نمایش کارت‌های بیشتر'}
        </button>
      )}

      {hints.length > 0 && (
        <ul>
          {hints.map((hint, index) => (
            <li key={index}>
              <CardTemplate variant="example" hint={hint} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
