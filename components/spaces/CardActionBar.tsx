'use client';

import { useState } from 'react';
import type { CardEngagement } from '@taavon/contracts';
import { bookmarkStateSchema, reactionSummarySchema } from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';
import { Bookmark, ChatIcon, Heart, Share2 } from '@/components/icons';
import { toPersianDigits } from '@/lib/persian-digits';

export interface CardActionBarProps {
  cardId: string;
  /** What the card arrived with - no request of its own, so a feed of cards costs one call, not four per card. */
  engagement: CardEngagement;
  /** Null for a visitor with no session: everything still reads, nothing writes (the API 401s anyway). */
  currentUserId: string | null;
  /** On a card's own page the comment action scrolls to the thread instead of navigating to it. */
  onCommentClick?: () => void;
}

/** Everything a card has besides its image and caption: پسند، گفت‌وگو، هم‌رسانی، نشان. */
const CELL = 'flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[12px] transition disabled:opacity-50';

/**
 * A card's four actions, in the one place they are defined.
 *
 * The same bar renders in the feed and on the card's own page, because they
 * are the same card - a like in the feed is the like on the page. Counts move
 * optimistically and are replaced by whatever the server says; a failure puts
 * the previous state back rather than leaving a number nobody can explain.
 *
 * Share is deliberately client-only: it hands the card's own address to the
 * person's own device (the share sheet, or the clipboard where there is none)
 * and tells no server that it happened. There is nothing to count and nobody
 * to notify - "هم‌رسانی" is the reader passing a link along, not an event the
 * platform collects.
 *
 * Bookmarking, by contrast, is stored and private: it returns no count and no
 * card ever shows how many people saved it.
 */
export function CardActionBar({ cardId, engagement, currentUserId, onCommentClick }: CardActionBarProps) {
  const [state, setState] = useState<CardEngagement>(engagement);
  const [pending, setPending] = useState<'like' | 'bookmark' | null>(null);
  const [shared, setShared] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signedIn = currentUserId !== null;

  async function handleLike() {
    if (!signedIn || pending) return;
    const previous = state;
    const liking = !state.likedByMe;
    setError(null);
    setPending('like');
    setState({ ...state, likedByMe: liking, likeCount: Math.max(0, state.likeCount + (liking ? 1 : -1)) });

    try {
      const summary = reactionSummarySchema.parse(
        await apiFetch(`/cards/${cardId}/reactions`, { method: 'POST', body: JSON.stringify({ type: 'LIKE' }) })
      );
      setState((current) => ({ ...current, likeCount: summary.counts.LIKE, likedByMe: summary.mine.includes('LIKE') }));
    } catch (err) {
      setState(previous);
      setError(err instanceof ApiError ? err.message : 'ثبت پسند ممکن نشد.');
    } finally {
      setPending(null);
    }
  }

  async function handleBookmark() {
    if (!signedIn || pending) return;
    const previous = state;
    setError(null);
    setPending('bookmark');
    setState({ ...state, bookmarkedByMe: !state.bookmarkedByMe });

    try {
      const result = bookmarkStateSchema.parse(await apiFetch(`/cards/${cardId}/bookmark`, { method: 'POST' }));
      setState((current) => ({ ...current, bookmarkedByMe: result.bookmarked }));
    } catch (err) {
      setState(previous);
      setError(err instanceof ApiError ? err.message : 'نشان‌کردن این کارت ممکن نشد.');
    } finally {
      setPending(null);
    }
  }

  async function handleShare() {
    const url = `${window.location.origin}/cards/${cardId}`;
    setError(null);
    try {
      if (navigator.share) {
        await navigator.share({ url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShared(true);
      window.setTimeout(() => setShared(false), 2000);
    } catch {
      // A share sheet the person dismissed is not an error, and a browser
      // that refuses clipboard access is not one either - the address bar
      // still has the link. Saying nothing is the honest outcome.
    }
  }

  return (
    <div dir="rtl" className="text-right">
      <div className="flex items-center divide-x divide-x-reverse divide-gray-100 border-t border-gray-100 text-gray-400">
        <button
          type="button"
          onClick={handleLike}
          disabled={!signedIn || pending !== null}
          aria-pressed={state.likedByMe}
          aria-label="پسند"
          className={`${CELL} ${state.likedByMe ? 'text-rose-500' : 'hover:text-rose-500'}`}
        >
          <Heart size={17} strokeWidth={1.8} />
          {state.likeCount > 0 && <span className="font-bold">{toPersianDigits(String(state.likeCount))}</span>}
        </button>

        <button
          type="button"
          onClick={onCommentClick}
          aria-label="گفت‌وگو"
          className={`${CELL} hover:text-[#527DA3]`}
        >
          <ChatIcon size={17} strokeWidth={1.8} />
          {state.commentCount > 0 && <span className="font-bold">{toPersianDigits(String(state.commentCount))}</span>}
        </button>

        <button type="button" onClick={handleShare} aria-label="هم‌رسانی" className={`${CELL} hover:text-[#527DA3]`}>
          <Share2 size={17} strokeWidth={1.8} />
          {shared && <span className="text-[11px]">کپی شد</span>}
        </button>

        <button
          type="button"
          onClick={handleBookmark}
          disabled={!signedIn || pending !== null}
          aria-pressed={state.bookmarkedByMe}
          aria-label="نشان‌کردن"
          className={`${CELL} ${state.bookmarkedByMe ? 'text-[#527DA3]' : 'hover:text-[#527DA3]'}`}
        >
          <Bookmark size={17} strokeWidth={1.8} />
        </button>
      </div>

      {error && (
        <p role="alert" className="px-3 py-1 text-[11px] text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
