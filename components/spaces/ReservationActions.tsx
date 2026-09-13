'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ReservationCloseReason } from '@taavon/contracts';
import { reservationStateResponseSchema, reserveCardResponseSchema } from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';

export interface ReservationActionsProps {
  cardId: string;
  cardAuthorId: string;
  currentUserId: string | null;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; state: 'ACTIVE' | 'RESERVED' | 'IN_USE' | 'RESERVATION_CLOSED' | 'TEMPORARILY_SUSPENDED'; reservationId: string | null; reserverId: string | null };

const CLOSE_REASON_LABELS: Record<ReservationCloseReason, string> = {
  RETURNED: 'بازگردانده شد',
  COMPLETED: 'انجام شد',
  TIME_ENDED: 'زمان به پایان رسید',
  OWNER_CLOSED: 'صاحب کارت بست',
};

async function loadReservationState(cardId: string): Promise<LoadState> {
  try {
    const view = reservationStateResponseSchema.parse(await apiFetch(`/cards/${cardId}/reservation`));
    return { status: 'ready', state: view.state, reservationId: view.reservationId, reserverId: view.reserverId };
  } catch (err) {
    return { status: 'error', message: err instanceof ApiError ? err.message : 'خطا در بارگذاری وضعیت رزرو.' };
  }
}

/**
 * "state button بر اساس actor/state از API می‌آید، نه منطق مستقل client" -
 * this component never guesses the reservation state; it fetches the real
 * one and only ever renders what that state (crossed with whether the
 * viewer is the owner, the current reserver, or a stranger) actually
 * allows. Every action re-fetches the state afterward rather than
 * optimistically guessing the next one.
 */
export function ReservationActions({ cardId, cardAuthorId, currentUserId }: ReservationActionsProps) {
  const router = useRouter();
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [closeReason, setCloseReason] = useState<ReservationCloseReason>('RETURNED');

  useEffect(() => {
    let cancelled = false;
    loadReservationState(cardId).then((result) => {
      if (!cancelled) setLoad(result);
    });
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  async function refresh() {
    setLoad(await loadReservationState(cardId));
  }

  async function runAction<T>(path: string, body?: unknown): Promise<T | null> {
    setBusy(true);
    setActionError(null);
    try {
      const result = await apiFetch<T>(path, {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      return result;
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'عملیات با خطا مواجه شد.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleReserve() {
    const result = await runAction(`/cards/${cardId}/reservations`);
    if (result) {
      const { conversationId } = reserveCardResponseSchema.parse(result);
      // Carries where this came from, so the chat's back button returns to
      // the card rather than dropping the person in the chats tab -
      // "back کاربر را به کارت مبدأ برگرداند" (Task 21).
      router.push(`/chats/${conversationId}?from=${encodeURIComponent(`/cards/${cardId}`)}`);
    }
  }

  async function handleCancel(reservationId: string) {
    if (await runAction(`/reservations/${reservationId}/cancel`)) await refresh();
  }
  async function handleRelease(reservationId: string) {
    if (await runAction(`/reservations/${reservationId}/release`, {})) await refresh();
  }
  async function handleMarkInUse(reservationId: string) {
    if (await runAction(`/reservations/${reservationId}/mark-in-use`)) await refresh();
  }
  async function handleClose(reservationId: string) {
    if (await runAction(`/reservations/${reservationId}/close`, { closeReason })) await refresh();
  }

  if (load.status === 'loading') {
    return (
      <p role="status" className="text-xs text-gray-400">
        در حال بارگذاری وضعیت رزرو...
      </p>
    );
  }
  if (load.status === 'error') {
    return (
      <p role="alert" className="text-xs text-red-700">
        {load.message}
      </p>
    );
  }

  const isOwner = currentUserId !== null && currentUserId === cardAuthorId;
  const isReserver = currentUserId !== null && currentUserId === load.reserverId;

  const errorNote = actionError && (
    <p role="alert" className="text-xs text-red-700">
      {actionError}
    </p>
  );

  // "در feed tag «منقضی» یا badge وضعیت terminal نشان نده؛ در detail دکمه
  // disabled و متن «رزرو این کارت بسته شده است» نمایش بده" - the feed
  // (CardTemplate) never shows this component at all; only the detail page
  // does, and here the exact required phrase appears next to a disabled button.
  if (load.state === 'RESERVATION_CLOSED') {
    return (
      <div dir="rtl" className="space-y-1 text-right">
        <button type="button" disabled className="w-full rounded-xl bg-gray-100 px-4 py-2 text-sm font-medium text-gray-400">
          رزرو
        </button>
        <p className="text-xs text-gray-500">رزرو این کارت بسته شده است.</p>
      </div>
    );
  }

  if (load.state === 'TEMPORARILY_SUSPENDED') {
    return (
      <p className="text-xs text-gray-500">این کارت در حال حاضر پذیرای رزرو نیست.</p>
    );
  }

  if (load.state === 'ACTIVE') {
    if (isOwner) return null;
    return (
      <div dir="rtl" className="space-y-1 text-right">
        <button
          type="button"
          onClick={handleReserve}
          disabled={busy || currentUserId === null}
          className="w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {currentUserId === null ? 'برای رزرو وارد شوید' : 'رزرو'}
        </button>
        {errorNote}
      </div>
    );
  }

  if (load.state === 'RESERVED' && load.reservationId) {
    if (isReserver) {
      return (
        <div dir="rtl" className="space-y-1 text-right">
          <button
            type="button"
            onClick={() => handleCancel(load.reservationId!)}
            disabled={busy}
            className="w-full rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 disabled:opacity-50"
          >
            لغو رزرو
          </button>
          {errorNote}
        </div>
      );
    }
    if (isOwner) {
      return (
        <div dir="rtl" className="space-y-2 text-right">
          <button
            type="button"
            onClick={() => handleMarkInUse(load.reservationId!)}
            disabled={busy}
            className="w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            علامت‌گذاری به‌عنوان در حال استفاده
          </button>
          <button
            type="button"
            onClick={() => handleRelease(load.reservationId!)}
            disabled={busy}
            className="w-full rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50"
          >
            رهاسازی این رزرو
          </button>
          {errorNote}
        </div>
      );
    }
    return <p className="text-xs text-gray-500">این کارت رزرو شده است.</p>;
  }

  if (load.state === 'IN_USE' && load.reservationId) {
    if (isOwner) {
      return (
        <div dir="rtl" className="space-y-2 text-right">
          <label className="block text-xs text-gray-600">
            دلیل بسته‌شدن
            <select
              value={closeReason}
              onChange={(event) => setCloseReason(event.target.value as ReservationCloseReason)}
              className="mt-1 w-full rounded-xl border border-gray-300 p-2 text-sm"
            >
              {(Object.keys(CLOSE_REASON_LABELS) as ReservationCloseReason[]).map((reason) => (
                <option key={reason} value={reason}>
                  {CLOSE_REASON_LABELS[reason]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => handleClose(load.reservationId!)}
            disabled={busy}
            className="w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            بستن رزرو
          </button>
          {errorNote}
        </div>
      );
    }
    return <p className="text-xs text-gray-500">این کارت در حال استفاده است.</p>;
  }

  return null;
}
