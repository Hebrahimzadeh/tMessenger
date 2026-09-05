'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { spaceSimilarResponseSchema, type SpaceSimilarItem } from '@taavon/contracts';
import { apiFetch } from '@/lib/api/client';

export interface SimilarSpacesProps {
  title: string;
  purpose: string;
}

/**
 * Shown while composing a new space - purely informational, never blocks
 * "ادامهٔ ساخت مستقل" (continuing to build independently, the composer's
 * own always-present button). Each match offers exactly one action of its
 * own: joining the existing space. There is no merge/transfer action here
 * or anywhere in this codebase - see space-similarity.service.ts.
 */
export function SimilarSpaces({ title, purpose }: SimilarSpacesProps) {
  const [items, setItems] = useState<SpaceSimilarItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (title.trim().length === 0) {
        if (!cancelled) setItems([]);
        return;
      }
      try {
        const result = spaceSimilarResponseSchema.parse(
          await apiFetch(`/spaces/similar?title=${encodeURIComponent(title)}&purpose=${encodeURIComponent(purpose)}`)
        );
        if (!cancelled) setItems(result.items);
      } catch {
        // Similarity is a courtesy, not a requirement - a failed lookup
        // must never block the composer, so it just shows nothing.
        if (!cancelled) setItems([]);
      }
    }
    const timeoutId = setTimeout(run, 400); // debounce - avoid a request per keystroke
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [title, purpose]);

  if (items.length === 0) return null;

  return (
    <div dir="rtl" className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-right">
      <p className="text-sm font-medium text-amber-900">این بسترها مشابه ایدهٔ شما به‌نظر می‌رسند:</p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between rounded-xl bg-white p-3">
            <span className="text-sm text-gray-800">{item.title}</span>
            <Link href={`/spaces/${item.slug}`} className="text-sm font-medium text-blue-600 underline">
              مشارکت در بستر موجود
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-xs text-amber-700">تصمیم با شماست - می‌توانید همچنان ساخت بستر خودتان را ادامه دهید.</p>
    </div>
  );
}
