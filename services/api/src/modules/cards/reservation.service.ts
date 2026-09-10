import type { CardStatus, ReservationCloseReason, ReservationState, SpaceStatus } from '@taavon/database';
import { canTransitionReservation, isTerminalReservationState } from './card-state-machine';

export class CardNotFoundForReservationError extends Error {
  constructor() {
    super('Card not found.');
    this.name = 'CardNotFoundForReservationError';
  }
}

/** The card's space is not PUBLISHED (including TEMPORARILY_SUSPENDED) or the card itself is not ACTIVE. */
export class ReservationsNotAcceptedError extends Error {
  constructor() {
    super('This card does not accept reservations right now.');
    this.name = 'ReservationsNotAcceptedError';
  }
}

export class CannotReserveOwnCardError extends Error {
  constructor() {
    super('The card author cannot reserve their own card.');
    this.name = 'CannotReserveOwnCardError';
  }
}

/** Someone else won a concurrent reserve, or a transition's expected (version, state) no longer matches. */
export class ReservationConflictError extends Error {
  constructor() {
    super('This reservation was just changed by someone else.');
    this.name = 'ReservationConflictError';
  }
}

export class ReservationNotFoundError extends Error {
  constructor() {
    super('Reservation not found.');
    this.name = 'ReservationNotFoundError';
  }
}

export class NotReservationOwnerError extends Error {
  constructor() {
    super("Only the card's owner may do this.");
    this.name = 'NotReservationOwnerError';
  }
}

export class NotReservationRequesterError extends Error {
  constructor() {
    super('Only the person who reserved this may cancel it.');
    this.name = 'NotReservationRequesterError';
  }
}

/** The reservation exists but is not in a state this action is valid from - "reopen 409". */
export class InvalidReservationTransitionError extends Error {
  constructor() {
    super('This action is not valid for the reservation in its current state.');
    this.name = 'InvalidReservationTransitionError';
  }
}

export interface ReservationRecord {
  id: string;
  cardId: string;
  ownerId: string;
  reserverId: string | null;
  state: ReservationState;
  version: number;
  conversationId: string | null;
  closeReason: ReservationCloseReason | null;
}

export interface ReservationRepository {
  getCardForReservation(cardId: string): Promise<{ ownerId: string; cardStatus: CardStatus; spaceStatus: SpaceStatus } | null>;
  findByCardId(cardId: string): Promise<ReservationRecord | null>;
  findById(id: string): Promise<ReservationRecord | null>;
  /**
   * Runs the whole reserve operation - create-or-CAS-transition the
   * reservation row, get-or-create the direct conversation, and log both
   * events - inside one transaction. Returns null if a concurrent reserve
   * won the race (the caller reports a conflict, never a partial result).
   */
  reserve(input: { cardId: string; ownerId: string; reserverId: string }): Promise<{ reservation: ReservationRecord } | null>;
  /** A generic compare-and-swap transition for cancel/release/mark-in-use/close - returns null if `expectedVersion` no longer matches (lost a race, or the state changed since the caller last read it). */
  transition(input: {
    id: string;
    expectedVersion: number;
    toState: ReservationState;
    actorId: string;
    reserverId?: string | null;
    releaseReason?: string | null;
    closeReason?: ReservationCloseReason | null;
    logAwarenessClosed?: boolean;
  }): Promise<ReservationRecord | null>;
}

/**
 * The view state a client actually renders - "ACTIVE" and
 * "TEMPORARILY_SUSPENDED" are never stored; they are derived from whether a
 * reservation row exists yet and whether the card's space currently
 * accepts new reservations.
 */
export type ReservationViewState = ReservationState | 'ACTIVE' | 'TEMPORARILY_SUSPENDED';

export interface ReservationStateView {
  cardId: string;
  state: ReservationViewState;
  reservationId: string | null;
  reserverId: string | null;
  closeReason: ReservationCloseReason | null;
}

export async function getReservationState(repo: ReservationRepository, cardId: string): Promise<ReservationStateView> {
  const card = await repo.getCardForReservation(cardId);
  if (!card) throw new CardNotFoundForReservationError();

  const reservation = await repo.findByCardId(cardId);
  if (reservation) {
    return {
      cardId,
      state: reservation.state,
      reservationId: reservation.id,
      reserverId: reservation.reserverId,
      closeReason: reservation.closeReason,
    };
  }

  const state: ReservationViewState = card.spaceStatus === 'PUBLISHED' ? 'ACTIVE' : 'TEMPORARILY_SUSPENDED';
  return { cardId, state, reservationId: null, reserverId: null, closeReason: null };
}

/**
 * "مرحلهٔ accept را حذف کن؛ reserve موفق فوراً RESERVED است" - a successful
 * call is immediately, atomically RESERVED with a real conversation to
 * message the owner in; there is no pending/accept step for the owner to
 * approve. "دو رزرو هم‌زمان ... فقط یکی موفق" is the repository's job (a DB
 * unique constraint for the very first reserve on a card, a version-column
 * compare-and-swap for every reserve after a cancel/release) - a lost race
 * here surfaces as `ReservationConflictError`, never a silent double-book.
 */
export async function reserveCard(
  repo: ReservationRepository,
  cardId: string,
  reserverId: string
): Promise<{ reservationId: string; conversationId: string }> {
  const card = await repo.getCardForReservation(cardId);
  if (!card) throw new CardNotFoundForReservationError();
  if (card.spaceStatus !== 'PUBLISHED' || card.cardStatus !== 'ACTIVE') throw new ReservationsNotAcceptedError();
  if (card.ownerId === reserverId) throw new CannotReserveOwnCardError();

  const result = await repo.reserve({ cardId, ownerId: card.ownerId, reserverId });
  if (!result) throw new ReservationConflictError();

  const { reservation } = result;
  if (!reservation.conversationId) {
    // The repository contract always sets this on a successful reserve; a
    // missing value here would be a repository bug, not a normal outcome.
    throw new Error('Reservation succeeded without a conversation - repository contract violation.');
  }

  return { reservationId: reservation.id, conversationId: reservation.conversationId };
}

async function requireReservation(repo: ReservationRepository, reservationId: string): Promise<ReservationRecord> {
  const reservation = await repo.findById(reservationId);
  if (!reservation) throw new ReservationNotFoundError();
  return reservation;
}

function assertTransition(reservation: ReservationRecord, toState: ReservationState): void {
  if (isTerminalReservationState(reservation.state)) throw new InvalidReservationTransitionError();
  if (!canTransitionReservation(reservation.state, toState)) throw new InvalidReservationTransitionError();
}

type TransitionExtras = Omit<Parameters<ReservationRepository['transition']>[0], 'id' | 'expectedVersion' | 'toState'>;

async function applyTransition(
  repo: ReservationRepository,
  reservation: ReservationRecord,
  toState: ReservationState,
  extra: TransitionExtras
): Promise<ReservationRecord> {
  const updated = await repo.transition({ id: reservation.id, expectedVersion: reservation.version, toState, ...extra });
  if (!updated) throw new ReservationConflictError();
  return updated;
}

/** "requester پیش از استفاده cancel کند" - only the person who reserved it, and only before the owner marks it in use. */
export async function cancelReservation(
  repo: ReservationRepository,
  reservationId: string,
  requesterId: string
): Promise<ReservationRecord> {
  const reservation = await requireReservation(repo, reservationId);
  if (reservation.reserverId !== requesterId) throw new NotReservationRequesterError();
  assertTransition(reservation, 'ACTIVE');
  return applyTransition(repo, reservation, 'ACTIVE', { actorId: requesterId, reserverId: null });
}

/** "owner رزرو نامعتبر را با reason release کند" - owner-only, same ACTIVE-returning transition as cancel, with an optional free-text reason. */
export async function releaseReservation(
  repo: ReservationRepository,
  reservationId: string,
  ownerId: string,
  reason: string | undefined
): Promise<ReservationRecord> {
  const reservation = await requireReservation(repo, reservationId);
  if (reservation.ownerId !== ownerId) throw new NotReservationOwnerError();
  assertTransition(reservation, 'ACTIVE');
  return applyTransition(repo, reservation, 'ACTIVE', { actorId: ownerId, reserverId: null, releaseReason: reason ?? null });
}

/** "owner پس از تحویل mark-in-use کند". */
export async function markReservationInUse(
  repo: ReservationRepository,
  reservationId: string,
  ownerId: string
): Promise<ReservationRecord> {
  const reservation = await requireReservation(repo, reservationId);
  if (reservation.ownerId !== ownerId) throw new NotReservationOwnerError();
  assertTransition(reservation, 'IN_USE');
  return applyTransition(repo, reservation, 'IN_USE', { actorId: ownerId });
}

/** "close فقط owner و terminal؛ reopen آن 409". */
export async function closeReservation(
  repo: ReservationRepository,
  reservationId: string,
  ownerId: string,
  closeReason: ReservationCloseReason
): Promise<ReservationRecord> {
  const reservation = await requireReservation(repo, reservationId);
  if (reservation.ownerId !== ownerId) throw new NotReservationOwnerError();
  assertTransition(reservation, 'RESERVATION_CLOSED');
  return applyTransition(repo, reservation, 'RESERVATION_CLOSED', { actorId: ownerId, closeReason, logAwarenessClosed: true });
}
