'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreateCardSheet } from './CreateCardSheet';

export interface DuplicateCardActionProps {
  spaceId: string;
  cardAuthorId: string;
  currentUserId: string | null;
  /** The original card's current body - carried into the new draft as a starting point, never copied server-side. */
  originalBody: string;
}

/**
 * "برای owner اقدام «ساخت کارت مشابه» بساز که draft تازه با body/media
 * reference مجاز ایجاد کند، نه reopen کارت قبلی" - this always goes
 * through the normal create-card flow (`CreateCardSheet` -> `CardComposer`
 * -> `POST /spaces/:id/cards`), so the result is a genuinely new card with
 * its own id; the original card and its reservation (open or long since
 * `RESERVATION_CLOSED`) are never touched. Only the body text carries
 * over - a finalized attachment already belongs to the original card and
 * cannot be re-attached to a new one (Task 14's own "one card per
 * attachment" rule), so media is a fresh upload if the author wants it
 * again, not a silent reference copy.
 */
export function DuplicateCardAction({ spaceId, cardAuthorId, currentUserId, originalBody }: DuplicateCardActionProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (currentUserId === null || currentUserId !== cardAuthorId) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
      >
        ساخت کارت مشابه
      </button>
      <CreateCardSheet
        isOpen={open}
        spaceId={spaceId}
        initialBody={originalBody}
        onClose={() => setOpen(false)}
        onCreated={(card) => {
          setOpen(false);
          router.push(`/cards/${card.id}`);
        }}
      />
    </>
  );
}
