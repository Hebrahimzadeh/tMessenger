'use client';

import Link from 'next/link';
import type { CardListItem, SpaceCardHint } from '@taavon/contracts';
import { Heart, ChatIcon, Paperclip, Truck } from '@/components/icons';
import { toPersianDigits } from '@/lib/persian-digits';

export type CardTemplateProps =
  | { variant: 'real'; card: CardListItem }
  | { variant: 'example'; hint: SpaceCardHint };

/**
 * "نمونه را با badge دائمی و CTAهای reaction/reserve/chat غیرفعال render
 * کن" - an example card hint carries the same three icons a real card
 * does, but every one of them is inert (no navigation, no handler) and the
 * "نمونه — محتوای واقعی نیست" badge is permanent, never dismissible.
 * Interacting (reacting, reserving, commenting) always happens on the real
 * card's own detail page - the feed's icons are deep-links into it, not
 * inline actions duplicating that state.
 */
export function CardTemplate(props: CardTemplateProps) {
  if (props.variant === 'example') {
    const { hint } = props;
    return (
      <div className="mb-3 w-full rounded-2xl border border-gray-100 bg-white p-3 text-right shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-medium text-gray-900">{hint.title}</h3>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            {hint.label} — محتوای واقعی نیست
          </span>
        </div>
        {hint.description && <p className="mb-3 text-sm text-gray-600">{hint.description}</p>}
        <div className="flex items-center border-t border-gray-100 pt-2 text-gray-300">
          <span className="flex flex-1 items-center justify-center gap-1.5 py-1.5">
            <Heart size={16} />
          </span>
          <span className="flex flex-1 items-center justify-center gap-1.5 py-1.5">
            <Truck size={16} />
          </span>
          <span className="flex flex-1 items-center justify-center gap-1.5 py-1.5">
            <ChatIcon size={16} />
          </span>
        </div>
      </div>
    );
  }

  const { card } = props;
  return (
    <Link
      href={`/cards/${card.id}`}
      className="mb-3 block w-full rounded-2xl border border-gray-100 bg-white p-3 text-right shadow-sm transition hover:shadow-md"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="font-medium text-gray-900">{card.title}</h3>
        {card.attachmentCount > 0 && (
          <span className="flex shrink-0 items-center gap-1 text-xs text-gray-400" dir="ltr">
            <Paperclip size={13} />
            {toPersianDigits(String(card.attachmentCount))}
          </span>
        )}
      </div>
      <p className="mb-2 line-clamp-3 text-sm text-gray-700">{card.body}</p>
      <div className="flex items-center border-t border-gray-100 pt-1 text-gray-400">
        <span className="flex flex-1 items-center justify-center gap-1.5 py-1.5 hover:text-rose-500">
          <Heart size={16} />
        </span>
        <span className="flex flex-1 items-center justify-center gap-1.5 py-1.5 hover:text-emerald-600">
          <Truck size={16} />
        </span>
        <span className="flex flex-1 items-center justify-center gap-1.5 py-1.5 hover:text-blue-600">
          <ChatIcon size={16} />
        </span>
      </div>
    </Link>
  );
}
