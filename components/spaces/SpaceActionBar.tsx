'use client';

import { Paperclip, Sparkles } from '@/components/icons';

export interface SpaceActionBarProps {
  /** False for a visitor who has not joined a published space: the bar becomes the join button instead. */
  canParticipate: boolean;
  onOpenTools: () => void;
  onCreateCard: () => void;
  onJoin: () => void;
  joining: boolean;
}

/**
 * The bar along the bottom of a space, where a chat's message box is.
 *
 * Two things and no more, exactly as the owner asked: the tool that makes a
 * card, and - to its side, where a chat keeps its attachment clip - the
 * space's own tools. Someone who has not joined a published space sees the
 * single join button in its place, which is what `tmessenger-v1.html` does.
 */
export function SpaceActionBar({ canParticipate, onOpenTools, onCreateCard, onJoin, joining }: SpaceActionBarProps) {
  if (!canParticipate) {
    return (
      <div className="z-30 shrink-0 border-t border-gray-200 bg-white p-3">
        <button
          type="button"
          onClick={onJoin}
          disabled={joining}
          className="w-full rounded-2xl bg-[#527DA3] py-3.5 text-[15px] font-bold text-white shadow-sm transition active:scale-[0.98] disabled:opacity-60"
        >
          {joining ? 'در حال پیوستن...' : 'عضویت در این بستر'}
        </button>
      </div>
    );
  }

  return (
    <div className="z-30 flex shrink-0 items-center gap-2 border-t border-gray-200 bg-[#f4f4f5] p-2">
      <button
        type="button"
        onClick={onOpenTools}
        aria-label="ابزارهای بستر"
        className="relative flex shrink-0 items-center justify-center rounded-full border border-blue-100 bg-blue-50 p-2 text-[#527DA3] shadow-sm transition hover:bg-blue-100"
      >
        <Paperclip size={22} strokeWidth={2} />
        <Sparkles size={12} className="absolute right-1 top-1 text-amber-500" aria-hidden />
      </button>
      <button
        type="button"
        onClick={onCreateCard}
        className="flex-1 rounded-2xl border border-gray-300/60 bg-white px-4 py-3 text-right text-[14px] text-gray-500 shadow-sm transition hover:bg-gray-50"
      >
        ایجاد درخواست یا کارت جدید...
      </button>
    </div>
  );
}
