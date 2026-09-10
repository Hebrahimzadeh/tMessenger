import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { CardStatus, SpaceStatus } from '@taavon/database';
import {
  cancelReservation,
  CannotReserveOwnCardError,
  CardNotFoundForReservationError,
  closeReservation,
  getReservationState,
  InvalidReservationTransitionError,
  markReservationInUse,
  NotReservationOwnerError,
  NotReservationRequesterError,
  releaseReservation,
  ReservationConflictError,
  ReservationNotFoundError,
  reserveCard,
  ReservationsNotAcceptedError,
  type ReservationRecord,
  type ReservationRepository,
} from './reservation.service';

const CARD = '11111111-1111-4111-8111-111111111111';
const OWNER = '22222222-2222-4222-8222-222222222222';
const RESERVER = '33333333-3333-4333-8333-333333333333';
const STRANGER = '44444444-4444-4444-8444-444444444444';

function fakeReservationRepo(opts: { cardStatus?: CardStatus; spaceStatus?: SpaceStatus } = {}) {
  const cardStatus: CardStatus = opts.cardStatus ?? 'ACTIVE';
  const spaceStatus: SpaceStatus = opts.spaceStatus ?? 'PUBLISHED';
  const rows = new Map<string, ReservationRecord>();
  const conversationByPair = new Map<string, string>();

  function pairKey(a: string, b: string) {
    return [a, b].sort().join(':');
  }
  function conversationFor(a: string, b: string) {
    const key = pairKey(a, b);
    if (!conversationByPair.has(key)) conversationByPair.set(key, randomUUID());
    return conversationByPair.get(key)!;
  }

  const repo: ReservationRepository = {
    async getCardForReservation(cardId) {
      return cardId === CARD ? { ownerId: OWNER, cardStatus, spaceStatus } : null;
    },
    async findByCardId(cardId) {
      return [...rows.values()].find((r) => r.cardId === cardId) ?? null;
    },
    async findById(id) {
      return rows.get(id) ?? null;
    },
    async reserve({ cardId, ownerId, reserverId }) {
      let row = [...rows.values()].find((r) => r.cardId === cardId);
      if (!row) {
        row = { id: randomUUID(), cardId, ownerId, reserverId, state: 'RESERVED', version: 1, conversationId: null, closeReason: null };
      } else if (row.state === 'ACTIVE') {
        row = { ...row, reserverId, state: 'RESERVED', version: row.version + 1 };
      } else {
        return null; // lost the race
      }
      row.conversationId = conversationFor(ownerId, reserverId);
      rows.set(row.id, row);
      return { reservation: row };
    },
    async transition({ id, expectedVersion, toState, reserverId, releaseReason, closeReason }) {
      const row = rows.get(id);
      if (!row || row.version !== expectedVersion) return null;
      const updated: ReservationRecord = {
        ...row,
        state: toState,
        version: row.version + 1,
        ...(reserverId !== undefined ? { reserverId } : {}),
        ...(closeReason !== undefined && closeReason !== null ? { closeReason } : {}),
      };
      void releaseReason;
      rows.set(id, updated);
      return updated;
    },
  };

  return { repo, rows };
}

describe('reserveCard', () => {
  it('creates a RESERVED reservation with a conversation immediately - no accept step', async () => {
    const { repo } = fakeReservationRepo();
    const result = await reserveCard(repo, CARD, RESERVER);
    expect(result.reservationId).toBeTruthy();
    expect(result.conversationId).toBeTruthy();
  });

  it('refuses the card author reserving their own card', async () => {
    const { repo } = fakeReservationRepo();
    await expect(reserveCard(repo, CARD, OWNER)).rejects.toBeInstanceOf(CannotReserveOwnCardError);
  });

  it('404s for an unknown card', async () => {
    const { repo } = fakeReservationRepo();
    await expect(reserveCard(repo, randomUUID(), RESERVER)).rejects.toBeInstanceOf(CardNotFoundForReservationError);
  });

  it('refuses reserving a card in a non-published space', async () => {
    const { repo } = fakeReservationRepo({ spaceStatus: 'TEMPORARILY_SUSPENDED' });
    await expect(reserveCard(repo, CARD, RESERVER)).rejects.toBeInstanceOf(ReservationsNotAcceptedError);
  });

  it('surfaces a lost race as a conflict, not a silent double-book', async () => {
    const { repo } = fakeReservationRepo();
    await reserveCard(repo, CARD, RESERVER); // now RESERVED
    // A second reserve while already RESERVED - the fake repo's `reserve`
    // only creates fresh when there is no row and only re-reserves an
    // ACTIVE row, so this returns null exactly like a real lost CAS race.
    await expect(reserveCard(repo, CARD, STRANGER)).rejects.toBeInstanceOf(ReservationConflictError);
  });
});

describe('cancelReservation / releaseReservation (both return to ACTIVE)', () => {
  it('lets only the requester cancel', async () => {
    const { repo } = fakeReservationRepo();
    const { reservationId } = await reserveCard(repo, CARD, RESERVER);
    await expect(cancelReservation(repo, reservationId, STRANGER)).rejects.toBeInstanceOf(NotReservationRequesterError);
    const cancelled = await cancelReservation(repo, reservationId, RESERVER);
    expect(cancelled.state).toBe('ACTIVE');
    expect(cancelled.reserverId).toBeNull();
  });

  it('lets only the owner release, with an optional reason', async () => {
    const { repo } = fakeReservationRepo();
    const { reservationId } = await reserveCard(repo, CARD, RESERVER);
    await expect(releaseReservation(repo, reservationId, STRANGER, undefined)).rejects.toBeInstanceOf(NotReservationOwnerError);
    const released = await releaseReservation(repo, reservationId, OWNER, 'اطلاعات نادرست بود');
    expect(released.state).toBe('ACTIVE');
  });

  it('allows a second reserve after cancel/release (no permanent lockout, unlike RESERVATION_CLOSED)', async () => {
    const { repo } = fakeReservationRepo();
    const first = await reserveCard(repo, CARD, RESERVER);
    await cancelReservation(repo, first.reservationId, RESERVER);
    const second = await reserveCard(repo, CARD, STRANGER);
    expect(second.reservationId).toBe(first.reservationId); // same row, cycled
  });

  it('404s for an unknown reservation', async () => {
    const { repo } = fakeReservationRepo();
    await expect(cancelReservation(repo, randomUUID(), RESERVER)).rejects.toBeInstanceOf(ReservationNotFoundError);
  });
});

describe('markReservationInUse', () => {
  it('owner-only, RESERVED -> IN_USE', async () => {
    const { repo } = fakeReservationRepo();
    const { reservationId } = await reserveCard(repo, CARD, RESERVER);
    await expect(markReservationInUse(repo, reservationId, STRANGER)).rejects.toBeInstanceOf(NotReservationOwnerError);
    const inUse = await markReservationInUse(repo, reservationId, OWNER);
    expect(inUse.state).toBe('IN_USE');
  });

  it('cannot mark in-use from ACTIVE (nothing reserved yet)', async () => {
    const { repo } = fakeReservationRepo();
    const { reservationId } = await reserveCard(repo, CARD, RESERVER);
    await cancelReservation(repo, reservationId, RESERVER);
    await expect(markReservationInUse(repo, reservationId, OWNER)).rejects.toBeInstanceOf(InvalidReservationTransitionError);
  });
});

describe('closeReservation ("terminal", "reopen 409")', () => {
  it('owner-only, closes from IN_USE with a reason', async () => {
    const { repo } = fakeReservationRepo();
    const { reservationId } = await reserveCard(repo, CARD, RESERVER);
    await markReservationInUse(repo, reservationId, OWNER);
    await expect(closeReservation(repo, reservationId, STRANGER, 'RETURNED')).rejects.toBeInstanceOf(NotReservationOwnerError);
    const closed = await closeReservation(repo, reservationId, OWNER, 'RETURNED');
    expect(closed.state).toBe('RESERVATION_CLOSED');
    expect(closed.closeReason).toBe('RETURNED');
  });

  it('owner can also close directly from RESERVED (OWNER_CLOSED, never handed over)', async () => {
    const { repo } = fakeReservationRepo();
    const { reservationId } = await reserveCard(repo, CARD, RESERVER);
    const closed = await closeReservation(repo, reservationId, OWNER, 'OWNER_CLOSED');
    expect(closed.state).toBe('RESERVATION_CLOSED');
  });

  it('is terminal - every further action 409s, including trying to close again', async () => {
    const { repo } = fakeReservationRepo();
    const { reservationId } = await reserveCard(repo, CARD, RESERVER);
    await closeReservation(repo, reservationId, OWNER, 'COMPLETED');

    await expect(closeReservation(repo, reservationId, OWNER, 'COMPLETED')).rejects.toBeInstanceOf(InvalidReservationTransitionError);
    await expect(cancelReservation(repo, reservationId, RESERVER)).rejects.toBeInstanceOf(InvalidReservationTransitionError);
    await expect(markReservationInUse(repo, reservationId, OWNER)).rejects.toBeInstanceOf(InvalidReservationTransitionError);
  });
});

describe('getReservationState (derived view)', () => {
  it('reports ACTIVE for a never-reserved card in a published space', async () => {
    const { repo } = fakeReservationRepo();
    const state = await getReservationState(repo, CARD);
    expect(state).toEqual({ cardId: CARD, state: 'ACTIVE', reservationId: null, reserverId: null, closeReason: null });
  });

  it('reports TEMPORARILY_SUSPENDED for a never-reserved card whose space is not published', async () => {
    const { repo } = fakeReservationRepo({ spaceStatus: 'TEMPORARILY_SUSPENDED' });
    const state = await getReservationState(repo, CARD);
    expect(state.state).toBe('TEMPORARILY_SUSPENDED');
  });

  it('reports the real stored state once a reservation exists', async () => {
    const { repo } = fakeReservationRepo();
    const { reservationId } = await reserveCard(repo, CARD, RESERVER);
    const state = await getReservationState(repo, CARD);
    expect(state).toMatchObject({ state: 'RESERVED', reservationId, reserverId: RESERVER });
  });
});
