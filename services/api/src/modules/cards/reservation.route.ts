import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  closeReservationBodySchema,
  releaseReservationBodySchema,
  reservationActionResponseSchema,
  reservationStateResponseSchema,
  reserveCardResponseSchema,
} from '@taavon/contracts';
import { apiError } from '../../lib/api-error';
import { withIdempotency, type IdempotencyRepository } from '../../lib/idempotency';
import { getOptionalSession, requireSession } from '../auth/session-guard';
import { createPrismaDirectConversationPort } from '../messaging/direct-conversation.repository';
import { createPrismaIdempotencyRepository } from './idempotency.repository';
import { createPrismaReservationRepository } from './reservation.repository';
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

export interface ReservationRouteOptions {
  sessionHmacKey: string;
  reservationRepository?: ReservationRepository;
  idempotencyRepository?: IdempotencyRepository;
}

function toActionResponse(reservation: ReservationRecord) {
  return reservationActionResponseSchema.parse({ reservationId: reservation.id, state: reservation.state });
}

function requireIdempotencyKey(request: FastifyRequest, reply: FastifyReply): string | null {
  const header = request.headers['idempotency-key'];
  const key = Array.isArray(header) ? header[0] : header;
  if (!key || key.trim().length === 0) {
    reply.code(400).send(apiError(request, 'IDEMPOTENCY_KEY_REQUIRED', 'هدر Idempotency-Key برای این عملیات اجباری است.'));
    return null;
  }
  return key;
}

/** Maps a thrown domain error to `{status, body}` - never re-thrown, so `withIdempotency` never caches an error response but still gets a well-formed reply to send. */
function toErrorResponse(err: unknown, request: FastifyRequest): { status: number; body: unknown } {
  if (err instanceof CardNotFoundForReservationError || err instanceof ReservationNotFoundError) {
    return { status: 404, body: apiError(request, 'RESERVATION_NOT_FOUND', 'این کارت یا رزرو یافت نشد.') };
  }
  if (err instanceof ReservationsNotAcceptedError) {
    return { status: 422, body: apiError(request, 'RESERVATIONS_NOT_ACCEPTED', 'این کارت در حال حاضر پذیرای رزرو نیست.') };
  }
  if (err instanceof CannotReserveOwnCardError) {
    return { status: 422, body: apiError(request, 'CANNOT_RESERVE_OWN_CARD', 'نمی‌توانید کارت خودتان را رزرو کنید.') };
  }
  if (err instanceof NotReservationOwnerError) {
    return { status: 403, body: apiError(request, 'FORBIDDEN', 'فقط صاحب کارت می‌تواند این کار را انجام دهد.') };
  }
  if (err instanceof NotReservationRequesterError) {
    return { status: 403, body: apiError(request, 'FORBIDDEN', 'فقط کسی که رزرو کرده می‌تواند آن را لغو کند.') };
  }
  if (err instanceof ReservationConflictError) {
    return { status: 409, body: apiError(request, 'RESERVATION_CONFLICT', 'این رزرو همین الان توسط شخص دیگری تغییر کرد.') };
  }
  if (err instanceof InvalidReservationTransitionError) {
    return { status: 409, body: apiError(request, 'INVALID_RESERVATION_TRANSITION', 'این عملیات برای وضعیت فعلی رزرو معتبر نیست.') };
  }
  throw err;
}

export async function reservationRoutes(app: FastifyInstance, opts: ReservationRouteOptions) {
  const conversationPort = createPrismaDirectConversationPort();

  function repo(): ReservationRepository {
    return opts.reservationRepository ?? createPrismaReservationRepository(app.db, conversationPort);
  }
  function idemRepo(): IdempotencyRepository {
    return opts.idempotencyRepository ?? createPrismaIdempotencyRepository(app.db);
  }

  async function idempotent<T>(
    request: FastifyRequest,
    reply: FastifyReply,
    scope: string,
    actorId: string,
    key: string,
    fn: () => Promise<{ status: number; body: T }>
  ) {
    const result = await withIdempotency(idemRepo(), scope, actorId, key, async () => {
      try {
        return await fn();
      } catch (err) {
        return toErrorResponse(err, request) as { status: number; body: T };
      }
    });
    reply.code(result.status).send(result.body);
  }

  app.get('/cards/:cardId/reservation', async (request, reply) => {
    const { cardId } = request.params as { cardId: string };
    getOptionalSession(request, opts.sessionHmacKey);

    try {
      const state = await getReservationState(repo(), cardId);
      return reservationStateResponseSchema.parse(state);
    } catch (err) {
      if (err instanceof CardNotFoundForReservationError) {
        return reply.code(404).send(apiError(request, 'CARD_NOT_FOUND', 'این کارت یافت نشد.'));
      }
      throw err;
    }
  });

  app.post('/cards/:cardId/reservations', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const key = requireIdempotencyKey(request, reply);
    if (!key) return;
    const { cardId } = request.params as { cardId: string };

    await idempotent(request, reply, 'reservation:reserve', user.userId, key, async () => {
      const result = await reserveCard(repo(), cardId, user.userId);
      return { status: 201, body: reserveCardResponseSchema.parse(result) };
    });
  });

  app.post('/reservations/:reservationId/cancel', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const key = requireIdempotencyKey(request, reply);
    if (!key) return;
    const { reservationId } = request.params as { reservationId: string };

    await idempotent(request, reply, 'reservation:cancel', user.userId, key, async () => {
      const reservation = await cancelReservation(repo(), reservationId, user.userId);
      return { status: 200, body: toActionResponse(reservation) };
    });
  });

  app.post('/reservations/:reservationId/release', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const key = requireIdempotencyKey(request, reply);
    if (!key) return;
    const { reservationId } = request.params as { reservationId: string };
    const body = releaseReservationBodySchema.parse(request.body ?? {});

    await idempotent(request, reply, 'reservation:release', user.userId, key, async () => {
      const reservation = await releaseReservation(repo(), reservationId, user.userId, body.reason);
      return { status: 200, body: toActionResponse(reservation) };
    });
  });

  app.post('/reservations/:reservationId/mark-in-use', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const key = requireIdempotencyKey(request, reply);
    if (!key) return;
    const { reservationId } = request.params as { reservationId: string };

    await idempotent(request, reply, 'reservation:mark-in-use', user.userId, key, async () => {
      const reservation = await markReservationInUse(repo(), reservationId, user.userId);
      return { status: 200, body: toActionResponse(reservation) };
    });
  });

  app.post('/reservations/:reservationId/close', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const key = requireIdempotencyKey(request, reply);
    if (!key) return;
    const { reservationId } = request.params as { reservationId: string };
    const body = closeReservationBodySchema.parse(request.body);

    await idempotent(request, reply, 'reservation:close', user.userId, key, async () => {
      const reservation = await closeReservation(repo(), reservationId, user.userId, body.closeReason);
      return { status: 200, body: toActionResponse(reservation) };
    });
  });
}
