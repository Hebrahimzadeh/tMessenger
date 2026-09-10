import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { describe, expect, it } from 'vitest';
import type { CardStatus, SpaceStatus } from '@taavon/database';
import { ZodError } from 'zod';
import { apiError } from '../../lib/api-error';
import type { IdempotencyRepository } from '../../lib/idempotency';
import { ACCESS_TOKEN_COOKIE, signAccessToken } from '../auth/session-tokens';
import { reservationRoutes } from './reservation.route';
import type { ReservationRecord, ReservationRepository } from './reservation.service';

const SESSION_HMAC_KEY = 'test-only-session-hmac-key';
const CARD = randomUUID();
const OWNER = '11111111-1111-4111-8111-111111111111';
const RESERVER = '22222222-2222-4222-8222-222222222222';
const STRANGER = '33333333-3333-4333-8333-333333333333';

function fakeReservationRepo(opts: { cardStatus?: CardStatus; spaceStatus?: SpaceStatus } = {}): ReservationRepository {
  const cardStatus: CardStatus = opts.cardStatus ?? 'ACTIVE';
  const spaceStatus: SpaceStatus = opts.spaceStatus ?? 'PUBLISHED';
  const rows = new Map<string, ReservationRecord>();

  return {
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
      const existing = [...rows.values()].find((r) => r.cardId === cardId);
      if (existing && existing.state !== 'ACTIVE') return null;
      const row: ReservationRecord = existing
        ? { ...existing, state: 'RESERVED', reserverId, version: existing.version + 1, conversationId: randomUUID() }
        : { id: randomUUID(), cardId, ownerId, reserverId, state: 'RESERVED', version: 1, conversationId: randomUUID(), closeReason: null };
      rows.set(row.id, row);
      return { reservation: row };
    },
    async transition({ id, expectedVersion, toState, reserverId, closeReason }) {
      const row = rows.get(id);
      if (!row || row.version !== expectedVersion) return null;
      const updated: ReservationRecord = {
        ...row,
        state: toState,
        version: row.version + 1,
        ...(reserverId !== undefined ? { reserverId } : {}),
        ...(closeReason !== undefined && closeReason !== null ? { closeReason } : {}),
      };
      rows.set(id, updated);
      return updated;
    },
  };
}

function fakeIdempotencyRepo(): IdempotencyRepository {
  const store = new Map<string, { responseStatus: number; responseBody: unknown }>();
  return {
    async find(scope, actorId, key) {
      return store.get(`${scope}:${actorId}:${key}`) ?? null;
    },
    async save(scope, actorId, key, responseStatus, responseBody) {
      store.set(`${scope}:${actorId}:${key}`, { responseStatus, responseBody });
    },
  };
}

function buildApp(overrides: { reservationRepository?: ReservationRepository; idempotencyRepository?: IdempotencyRepository } = {}) {
  const app = Fastify();
  app.register(cookie);
  app.setErrorHandler((err, request, reply) => {
    if (err instanceof ZodError) {
      reply.code(400).send(apiError(request, 'VALIDATION_ERROR', 'داده ارسالی معتبر نیست.', err.issues));
      return;
    }
    reply.send(err);
  });
  app.register(reservationRoutes, {
    prefix: '/v1',
    sessionHmacKey: SESSION_HMAC_KEY,
    reservationRepository: overrides.reservationRepository ?? fakeReservationRepo(),
    idempotencyRepository: overrides.idempotencyRepository ?? fakeIdempotencyRepo(),
  });
  return app;
}

function cookieFor(userId: string) {
  return { [ACCESS_TOKEN_COOKIE]: signAccessToken(userId, SESSION_HMAC_KEY) };
}

describe('POST /v1/cards/:cardId/reservations', () => {
  it('requires a session', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/v1/cards/${CARD}/reservations`,
      headers: { 'idempotency-key': 'k1' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('requires an Idempotency-Key header', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: `/v1/cards/${CARD}/reservations`, cookies: cookieFor(RESERVER) });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    await app.close();
  });

  it('reserves immediately (no accept step) and returns a reservationId + conversationId', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/v1/cards/${CARD}/reservations`,
      cookies: cookieFor(RESERVER),
      headers: { 'idempotency-key': 'k1' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().reservationId).toBeTruthy();
    expect(res.json().conversationId).toBeTruthy();
    await app.close();
  });

  it('refuses the owner reserving their own card', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/v1/cards/${CARD}/reservations`,
      cookies: cookieFor(OWNER),
      headers: { 'idempotency-key': 'k1' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('CANNOT_RESERVE_OWN_CARD');
    await app.close();
  });

  it('replays the exact same response for a retried request under the same Idempotency-Key', async () => {
    const app = buildApp();
    const first = await app.inject({
      method: 'POST',
      url: `/v1/cards/${CARD}/reservations`,
      cookies: cookieFor(RESERVER),
      headers: { 'idempotency-key': 'same-key' },
    });
    const second = await app.inject({
      method: 'POST',
      url: `/v1/cards/${CARD}/reservations`,
      cookies: cookieFor(RESERVER),
      headers: { 'idempotency-key': 'same-key' },
    });
    expect(second.statusCode).toBe(first.statusCode);
    expect(second.json()).toEqual(first.json());
    await app.close();
  });

  it('a second reserve attempt (different key, already RESERVED) returns a conflict, not a double-book', async () => {
    const repo = fakeReservationRepo();
    const app = buildApp({ reservationRepository: repo });
    await app.inject({
      method: 'POST',
      url: `/v1/cards/${CARD}/reservations`,
      cookies: cookieFor(RESERVER),
      headers: { 'idempotency-key': 'k1' },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/v1/cards/${CARD}/reservations`,
      cookies: cookieFor(STRANGER),
      headers: { 'idempotency-key': 'k2' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('RESERVATION_CONFLICT');
    await app.close();
  });
});

describe('the full reserve -> mark-in-use -> close flow', () => {
  it('works end to end and refuses reopening a closed reservation', async () => {
    const repo = fakeReservationRepo();
    const app = buildApp({ reservationRepository: repo });

    const reserved = await app.inject({
      method: 'POST',
      url: `/v1/cards/${CARD}/reservations`,
      cookies: cookieFor(RESERVER),
      headers: { 'idempotency-key': 'k1' },
    });
    const reservationId = reserved.json().reservationId as string;

    const state1 = await app.inject({ method: 'GET', url: `/v1/cards/${CARD}/reservation` });
    expect(state1.json().state).toBe('RESERVED');

    const inUse = await app.inject({
      method: 'POST',
      url: `/v1/reservations/${reservationId}/mark-in-use`,
      cookies: cookieFor(OWNER),
      headers: { 'idempotency-key': 'k2' },
    });
    expect(inUse.statusCode).toBe(200);
    expect(inUse.json().state).toBe('IN_USE');

    const closed = await app.inject({
      method: 'POST',
      url: `/v1/reservations/${reservationId}/close`,
      cookies: cookieFor(OWNER),
      headers: { 'idempotency-key': 'k3' },
      payload: { closeReason: 'RETURNED' },
    });
    expect(closed.statusCode).toBe(200);
    expect(closed.json().state).toBe('RESERVATION_CLOSED');

    const state2 = await app.inject({ method: 'GET', url: `/v1/cards/${CARD}/reservation` });
    expect(state2.json().state).toBe('RESERVATION_CLOSED');

    const reopenAttempt = await app.inject({
      method: 'POST',
      url: `/v1/reservations/${reservationId}/mark-in-use`,
      cookies: cookieFor(OWNER),
      headers: { 'idempotency-key': 'k4' },
    });
    expect(reopenAttempt.statusCode).toBe(409);
    expect(reopenAttempt.json().error.code).toBe('INVALID_RESERVATION_TRANSITION');

    await app.close();
  });
});

describe('cancel / release both return the card to ACTIVE', () => {
  it('the requester can cancel before use', async () => {
    const repo = fakeReservationRepo();
    const app = buildApp({ reservationRepository: repo });
    const reserved = await app.inject({
      method: 'POST',
      url: `/v1/cards/${CARD}/reservations`,
      cookies: cookieFor(RESERVER),
      headers: { 'idempotency-key': 'k1' },
    });
    const reservationId = reserved.json().reservationId as string;

    const forbidden = await app.inject({
      method: 'POST',
      url: `/v1/reservations/${reservationId}/cancel`,
      cookies: cookieFor(STRANGER),
      headers: { 'idempotency-key': 'k2' },
    });
    expect(forbidden.statusCode).toBe(403);

    const cancelled = await app.inject({
      method: 'POST',
      url: `/v1/reservations/${reservationId}/cancel`,
      cookies: cookieFor(RESERVER),
      headers: { 'idempotency-key': 'k3' },
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().state).toBe('ACTIVE');

    const state = await app.inject({ method: 'GET', url: `/v1/cards/${CARD}/reservation` });
    expect(state.json().state).toBe('ACTIVE');
    await app.close();
  });

  it('the owner can release an invalid reservation with a reason', async () => {
    const repo = fakeReservationRepo();
    const app = buildApp({ reservationRepository: repo });
    const reserved = await app.inject({
      method: 'POST',
      url: `/v1/cards/${CARD}/reservations`,
      cookies: cookieFor(RESERVER),
      headers: { 'idempotency-key': 'k1' },
    });
    const reservationId = reserved.json().reservationId as string;

    const released = await app.inject({
      method: 'POST',
      url: `/v1/reservations/${reservationId}/release`,
      cookies: cookieFor(OWNER),
      headers: { 'idempotency-key': 'k2' },
      payload: { reason: 'اطلاعات نادرست بود' },
    });
    expect(released.statusCode).toBe(200);
    expect(released.json().state).toBe('ACTIVE');
    await app.close();
  });
});
