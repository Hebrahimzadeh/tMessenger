import type { CardAttachmentStatus, ReservationState } from '@taavon/database';

/**
 * The attachment lifecycle - "وضعیت پیوست PENDING|PROCESSING|READY|REJECTED".
 * PENDING is the bare intent; PROCESSING means real bytes landed via the
 * upload route; finalize is the one authoritative gate that moves it to
 * READY or REJECTED. READY and REJECTED are terminal - an attachment's
 * outcome never changes once decided, so a card view can trust that a
 * READY attachment stays valid and a REJECTED one is permanently out.
 */
const ALLOWED: ReadonlyArray<readonly [CardAttachmentStatus, CardAttachmentStatus]> = [
  ['PENDING', 'PROCESSING'],
  ['PENDING', 'REJECTED'],
  ['PROCESSING', 'READY'],
  ['PROCESSING', 'REJECTED'],
];

export function canTransitionAttachment(from: CardAttachmentStatus, to: CardAttachmentStatus): boolean {
  return ALLOWED.some(([f, t]) => f === from && t === to);
}

export function isTerminalAttachmentStatus(status: CardAttachmentStatus): boolean {
  return status === 'READY' || status === 'REJECTED';
}

/**
 * The reservation lifecycle - "مرحلهٔ accept را حذف کن؛ reserve موفق فوراً
 * RESERVED است". ACTIVE has no stored row (a card with no CardReservation
 * *is* ACTIVE); RESERVED->ACTIVE is cancel (by the requester) or release
 * (by the owner) and can happen more than once - only RESERVATION_CLOSED
 * is terminal ("reactivation/EXPIRED صفر" - a closed reservation's row
 * never transitions again; a new card is the only way forward, per Task
 * 17's "duplicate card" action).
 */
const RESERVATION_TRANSITIONS: ReadonlyArray<readonly [ReservationState, ReservationState]> = [
  ['ACTIVE', 'RESERVED'],
  ['RESERVED', 'ACTIVE'],
  ['RESERVED', 'IN_USE'],
  ['RESERVED', 'RESERVATION_CLOSED'],
  ['IN_USE', 'RESERVATION_CLOSED'],
];

export function canTransitionReservation(from: ReservationState, to: ReservationState): boolean {
  return RESERVATION_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function isTerminalReservationState(state: ReservationState): boolean {
  return state === 'RESERVATION_CLOSED';
}
