'use client';

import { useEffect, useState } from 'react';
import type { CardReactionType, ReactionSummary } from '@taavon/contracts';
import { reactionSummarySchema } from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';
import { toPersianDigits } from '@/lib/persian-digits';

export interface CardReactionsProps {
  cardId: string;
  /** Reading is public even for an anonymous visitor; toggling still requires a session (the API 401s). */
  currentUserId?: string | null;
}

const REACTION_LABELS: Record<CardReactionType, string> = {
  SUPPORT: 'حمایت',
  USEFUL: 'مفید بود',
  INTERESTED: 'علاقه‌مندم',
  CELEBRATE: 'تبریک',
};

const REACTION_TYPES = Object.keys(REACTION_LABELS) as CardReactionType[];

const EMPTY_SUMMARY: ReactionSummary = { counts: { SUPPORT: 0, USEFUL: 0, INTERESTED: 0, CELEBRATE: 0 }, mine: [] };

/**
 * "reaction فقط ضریب کوچک سقف‌دار" on the server side; here it is simply a
 * set of small toggle buttons - no combined score, no ranking display,
 * just per-type counts. Toggling is optimistic and idempotent (matching
 * the API): clicking an already-active reaction removes it.
 */
export function CardReactions({ cardId, currentUserId = null }: CardReactionsProps) {
  const [summary, setSummary] = useState<ReactionSummary>(EMPTY_SUMMARY);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<CardReactionType | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = reactionSummarySchema.parse(await apiFetch(`/cards/${cardId}/reactions`));
        if (!cancelled) setSummary(result);
      } catch {
        // A read-only summary failing to load is not worth blocking the whole card view over.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  async function handleToggle(type: CardReactionType) {
    if (!currentUserId || pending) return;

    const wasMine = summary.mine.includes(type);
    const previous = summary;
    setError(null);
    setPending(type);
    setSummary((prev) => ({
      counts: { ...prev.counts, [type]: prev.counts[type] + (wasMine ? -1 : 1) },
      mine: wasMine ? prev.mine.filter((t) => t !== type) : [...prev.mine, type],
    }));

    try {
      const result = reactionSummarySchema.parse(
        await apiFetch(`/cards/${cardId}/reactions`, { method: 'POST', body: JSON.stringify({ type }) })
      );
      setSummary(result);
    } catch (err) {
      setSummary(previous);
      setError(err instanceof ApiError ? err.message : 'ثبت واکنش ممکن نشد.');
    } finally {
      setPending(null);
    }
  }

  if (!loaded) {
    return (
      <p role="status" className="text-xs text-gray-400">
        در حال بارگذاری واکنش‌ها...
      </p>
    );
  }

  return (
    <div dir="rtl" className="space-y-1">
      <div className="flex flex-wrap gap-2">
        {REACTION_TYPES.map((type) => {
          const active = summary.mine.includes(type);
          return (
            <button
              key={type}
              type="button"
              onClick={() => handleToggle(type)}
              disabled={!currentUserId || pending !== null}
              aria-pressed={active}
              className={`rounded-full border px-3 py-1 text-xs disabled:opacity-50 ${
                active ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-600'
              }`}
            >
              {REACTION_LABELS[type]} {toPersianDigits(String(summary.counts[type]))}
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
