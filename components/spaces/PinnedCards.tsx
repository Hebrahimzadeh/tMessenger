'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { PinnedCardListResponse } from '@taavon/contracts';
import { pinnedCardListResponseSchema } from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';

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

  return (
    <div dir="rtl" className="space-y-2 text-right">
      <p className="text-sm font-semibold text-gray-800">کارت‌های سنجاق‌شده</p>
      <ul className="space-y-2">
        {pins.items.map((pin) => (
          <li key={pin.cardId}>
            <Link
              href={`/cards/${pin.cardId}`}
              className="block rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
            >
              📌 {pin.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
