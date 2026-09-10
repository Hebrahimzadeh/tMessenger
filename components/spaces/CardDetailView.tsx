'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { CardResponse } from '@taavon/contracts';
import { cardResponseSchema, spaceResponseSchema } from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';
import { renderPlainTextWithLinks } from '@/lib/linkify';
import { useCurrentUserId } from '@/hooks/useCurrentUserId';
import { CardReactions } from './CardReactions';
import { DuplicateCardAction } from './DuplicateCardAction';
import { MediaPreview } from './MediaPreview';
import { PublicThread } from './PublicThread';
import { ReservationActions } from './ReservationActions';

export interface CardDetailViewProps {
  cardId: string;
}

type GateState =
  | { status: 'loading' }
  | { status: 'not_found'; message: string }
  | { status: 'error'; message: string }
  | { status: 'ready'; card: CardResponse; canModerate: boolean };

/**
 * The real, API-backed card detail page - "صفحهٔ card detail را به thread
 * عمومی و actionها متصل کن". Deliberately never renders the author's
 * display name, username, or phone anywhere - "شماره/هویت رسمی عمومی
 * نشود" - only the opaque `authorId`, which every component here only
 * ever uses for an equality check (is this me?), never for display.
 */
export function CardDetailView({ cardId }: CardDetailViewProps) {
  const [gate, setGate] = useState<GateState>({ status: 'loading' });
  const currentUser = useCurrentUserId();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const card = cardResponseSchema.parse(await apiFetch(`/cards/${cardId}`));
        let canModerate = false;
        try {
          const space = spaceResponseSchema.parse(await apiFetch(`/spaces/${card.spaceId}`));
          canModerate = space.canManage;
        } catch {
          // The space call is only used for the moderate-delete affordance
          // on comments - if it fails, the card itself can still render;
          // the server re-checks moderation rights on every real delete
          // regardless of what this flag shows.
        }
        if (!cancelled) setGate({ status: 'ready', card, canModerate });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === 'CARD_NOT_FOUND') {
          setGate({ status: 'not_found', message: 'این کارت یافت نشد.' });
        } else {
          setGate({ status: 'error', message: err instanceof ApiError ? err.message : 'خطای غیرمنتظره‌ای رخ داد.' });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  if (gate.status === 'loading') {
    return (
      <p role="status" className="p-6 text-center text-gray-500">
        در حال بارگذاری...
      </p>
    );
  }
  if (gate.status === 'not_found' || gate.status === 'error') {
    return (
      <p role={gate.status === 'error' ? 'alert' : 'status'} className="p-6 text-center text-gray-500">
        {gate.message}
      </p>
    );
  }

  const { card, canModerate } = gate;
  const userId = currentUser.status === 'ready' ? currentUser.userId : null;

  return (
    <div dir="rtl" className="mx-auto max-w-2xl p-4 text-right">
      <Link href={`/spaces/${card.spaceId}`} className="mb-3 inline-block text-sm text-blue-700 underline">
        بازگشت به بستر
      </Link>

      <article className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <h1 className="mb-2 text-lg font-semibold text-gray-900">{card.revision.title}</h1>
        {card.revision.body && (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
            {renderPlainTextWithLinks(card.revision.body)}
          </p>
        )}
        {card.attachments.length > 0 && (
          <div className="mt-3 space-y-2">
            {card.attachments.map((attachment) => (
              <MediaPreview key={attachment.id} item={{ source: 'remote', attachment }} />
            ))}
          </div>
        )}
      </article>

      <section className="mt-3">
        <CardReactions cardId={card.id} currentUserId={userId} />
      </section>

      <section className="mt-3 space-y-2">
        <ReservationActions cardId={card.id} cardAuthorId={card.authorId} currentUserId={userId} />
        <DuplicateCardAction spaceId={card.spaceId} cardAuthorId={card.authorId} currentUserId={userId} originalBody={card.revision.body} />
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-gray-800">گفت‌وگوی عمومی</h2>
        <PublicThread cardId={card.id} currentUserId={userId} canModerate={canModerate} />
      </section>
    </div>
  );
}
