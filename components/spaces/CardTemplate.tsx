'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CardListItem } from '@taavon/contracts';
import { ImageIcon, Paperclip } from '@/components/icons';
import { toPersianDigits } from '@/lib/persian-digits';
import { CardActionBar } from './CardActionBar';

export interface CardTemplateProps {
  card: CardListItem;
  /** Null for a visitor with no session - the four actions still render, and the two that write are disabled. */
  currentUserId?: string | null;
}

/**
 * A card in a feed, in the shape the owner settled on (2026-09-27): an
 * image, a caption, and four actions - پسند، گفت‌وگو، هم‌رسانی، نشان.
 *
 * It has no name and no title. Where a title used to sit there is now
 * nothing, because a card is a thing somebody is showing and what they wrote
 * under it, the way a message in a conversation is.
 *
 * Either half can be missing and it is still a whole card: an image with
 * nothing written under it, or a caption with no image - "گاهی کاربر تصویر
 * هم اضافه نمی‌کند".
 *
 * The image and caption navigate to the card's own page; the action bar's
 * buttons sit outside that link, so liking something in the feed does not
 * navigate away from it (and so a button is not nested inside an anchor,
 * which no browser renders predictably).
 */
export function CardTemplate({ card, currentUserId = null }: CardTemplateProps) {
  const router = useRouter();
  const caption = card.body.trim();
  // Attachments the caption does not already account for: the image is
  // rendered, so it is not news that the card has one.
  const otherAttachments = card.imageUrl ? card.attachmentCount - 1 : card.attachmentCount;

  return (
    <article className="mb-3 w-full overflow-hidden rounded-2xl border border-gray-100 bg-white text-right shadow-sm">
      <Link href={`/cards/${card.id}`} className="block transition hover:bg-gray-50/60">
        {card.imageUrl && (
          // A signed, time-limited URL: next/image would need its host on an
          // allowlist and would re-fetch it server-side - the same reason
          // MediaPreview renders one directly.
          //
          // The alt text is empty when there is a caption, because the
          // caption is right underneath and describing it twice is noise. A
          // card with no caption gets a name instead, so the image is not
          // simply invisible to a screen reader.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.imageUrl}
            alt={caption ? '' : 'تصویر کارت'}
            className="max-h-80 w-full bg-gray-50 object-cover"
          />
        )}
        <div className="p-3">
          {caption ? (
            <p className="line-clamp-4 whitespace-pre-wrap text-[13px] leading-relaxed text-gray-700">{caption}</p>
          ) : (
            !card.imageUrl && (
              <p className="flex items-center gap-1.5 text-[12px] text-gray-400">
                <ImageIcon size={14} />
                این کارت فقط پیوست دارد.
              </p>
            )
          )}
          {otherAttachments > 0 && (
            <span dir="ltr" className="mt-2 flex items-center gap-1 text-[11px] text-gray-400">
              <Paperclip size={13} />
              {toPersianDigits(String(otherAttachments))}
            </span>
          )}
        </div>
      </Link>
      <CardActionBar
        cardId={card.id}
        engagement={card.engagement}
        currentUserId={currentUserId}
        onCommentClick={() => router.push(`/cards/${card.id}`)}
      />
    </article>
  );
}
