'use client';

import Link from 'next/link';
import type { CardListItem, SpaceCardHint } from '@taavon/contracts';
import { Heart, ChatIcon, Paperclip, Truck } from '@/components/icons';
import { toPersianDigits } from '@/lib/persian-digits';

export type CardTemplateProps =
  | { variant: 'real'; card: CardListItem }
  | { variant: 'example'; hint: SpaceCardHint };

/**
 * A card in a space's feed - a message in the conversation, in the shape
 * `tmessenger-v1.html`'s `renderCardTemplate` gives it: a rounded white
 * bubble with the author's initial, the body, and the three actions along a
 * divided footer.
 *
 * "نمونه را با badge دائمی و CTAهای reaction/reserve/chat غیرفعال render
 * کن" - an example card hint carries the same three icons a real card does,
 * but every one of them is inert (no navigation, no handler) and the
 * "نمونه — محتوای واقعی نیست" badge is permanent, never dismissible.
 * Interacting (reacting, reserving, commenting) always happens on the real
 * card's own detail page - the feed's icons are deep-links into it, not
 * inline actions duplicating that state.
 */
function Footer({ inert, commentCount }: { inert: boolean; commentCount?: number }) {
  const cell = 'flex flex-1 items-center justify-center gap-1.5 py-2.5';
  return (
    <div className={`flex items-center divide-x divide-x-reverse divide-gray-100 border-t border-gray-100 ${inert ? 'text-gray-300' : 'text-gray-400'}`}>
      <span className={`${cell} ${inert ? '' : 'hover:text-rose-500'}`}>
        <Heart size={17} strokeWidth={1.8} />
      </span>
      <span className={`${cell} ${inert ? '' : 'hover:text-emerald-600'}`}>
        <Truck size={17} strokeWidth={1.8} />
      </span>
      <span className={`${cell} ${inert ? '' : 'hover:text-[#527DA3]'}`}>
        <ChatIcon size={17} strokeWidth={1.8} />
        {commentCount !== undefined && commentCount > 0 && (
          <span className="text-[11px] font-bold text-gray-500">{toPersianDigits(String(commentCount))}</span>
        )}
      </span>
    </div>
  );
}

export function CardTemplate(props: CardTemplateProps) {
  if (props.variant === 'example') {
    const { hint } = props;
    return (
      <div className="mb-3 w-full overflow-hidden rounded-2xl border border-gray-100 bg-white text-right shadow-sm">
        <div className="p-3">
          <div className="mb-2.5 flex items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[13px] font-bold text-gray-400">
              ؟
            </div>
            <span className="text-[13px] font-bold leading-tight text-gray-800">{hint.title}</span>
            <span className="mr-auto shrink-0 whitespace-nowrap rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
              {hint.label} — محتوای واقعی نیست
            </span>
          </div>
          {hint.description && <p className="text-[13px] leading-relaxed text-gray-600">{hint.description}</p>}
        </div>
        <Footer inert />
      </div>
    );
  }

  const { card } = props;
  return (
    <Link
      href={`/cards/${card.id}`}
      className="mb-3 block w-full overflow-hidden rounded-2xl border border-gray-100 bg-white text-right shadow-sm transition hover:shadow-md active:scale-[0.99]"
    >
      <div className="p-3">
        <div className="mb-2.5 flex items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#527DA3] to-blue-400 text-[13px] font-bold text-white">
            {card.title.trim().charAt(0)}
          </div>
          <span className="min-w-0 flex-1 truncate text-[13px] font-bold leading-tight text-gray-800">{card.title}</span>
          {card.attachmentCount > 0 && (
            <span dir="ltr" className="flex shrink-0 items-center gap-1 text-[11px] text-gray-400">
              <Paperclip size={13} />
              {toPersianDigits(String(card.attachmentCount))}
            </span>
          )}
        </div>
        <p className="line-clamp-3 text-[13px] leading-relaxed text-gray-700">{card.body}</p>
      </div>
      <Footer inert={false} />
    </Link>
  );
}
