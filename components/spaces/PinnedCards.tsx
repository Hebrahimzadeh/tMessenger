'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { PinnedCardListResponse } from '@taavon/contracts';
import { pinnedCardListResponseSchema } from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';
import { Pin } from '@/components/icons';

export interface PinnedCardsProps {
  spaceId: string;
}

/**
 * A read-only, public widget - pinning itself is creator/admin-only
 * server-side ("pin/unpin فقط creator/space-admin"); this component only
 * ever displays the current pinned set, in the fixed `position` order the
 * API returns, capped at the same `limit` the API enforces.
 */
export function PinnedCards({ spaceId }: PinnedCardsProps) {
  const [pins, setPins] = useState<PinnedCardListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = pinnedCardListResponseSchema.parse(await apiFetch(`/spaces/${spaceId}/pins`));
        if (!cancelled) setPins(result);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'بارگذاری کارت‌های سنجاق‌شده ممکن نشد.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [spaceId]);

  if (error) {
    return (
      <p role="alert" className="text-xs text-red-700">
        {error}
      </p>
    );
  }

  if (!pins || pins.items.length === 0) return null;

  // The pinned-message strip of a chat: stuck to the top of the feed,
  // one line each, never a section with a heading of its own.
  return (
    <div dir="rtl" className="sticky top-0 z-10 divide-y divide-gray-100 border-b border-gray-100 bg-white text-right shadow-sm">
      {pins.items.map((pin) => (
        <Link key={pin.cardId} href={`/cards/${pin.cardId}`} className="flex items-center gap-3 px-3 py-2.5 transition hover:bg-gray-50">
          <Pin size={20} className="shrink-0 text-[#527DA3]" aria-hidden />
          <div className="min-w-0 flex-1 border-r-2 border-[#527DA3] pr-2.5">
            <div className="mb-0.5 text-[11px] font-bold text-[#527DA3]">کارت سنجاق‌شده</div>
            <div className="truncate text-[12px] text-gray-600">{pin.title}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}
