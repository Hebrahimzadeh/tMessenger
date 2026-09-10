import { z } from 'zod';

/**
 * "stateهای قابلیت رزرو ACTIVE|RESERVED|IN_USE|RESERVATION_CLOSED|
 * TEMPORARILY_SUSPENDED" - ACTIVE and TEMPORARILY_SUSPENDED are never
 * stored (see the Card_reservation Prisma model's own comment); they are
 * derived view states a client still needs to render, so both belong in
 * this contract even though only the middle three are real DB values.
 */
export const reservationStateSchema = z.enum(['ACTIVE', 'RESERVED', 'IN_USE', 'RESERVATION_CLOSED', 'TEMPORARILY_SUSPENDED']);
export type ReservationState = z.infer<typeof reservationStateSchema>;

export const reservationCloseReasonSchema = z.enum(['RETURNED', 'COMPLETED', 'TIME_ENDED', 'OWNER_CLOSED']);
export type ReservationCloseReason = z.infer<typeof reservationCloseReasonSchema>;

export const reserveCardResponseSchema = z.object({
  reservationId: z.string().uuid(),
  conversationId: z.string().uuid(),
});
export type ReserveCardResponse = z.infer<typeof reserveCardResponseSchema>;

export const releaseReservationBodySchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});
export type ReleaseReservationBody = z.infer<typeof releaseReservationBodySchema>;

export const closeReservationBodySchema = z.object({
  closeReason: reservationCloseReasonSchema,
});
export type CloseReservationBody = z.infer<typeof closeReservationBodySchema>;

export const reservationActionResponseSchema = z.object({
  reservationId: z.string().uuid(),
  state: reservationStateSchema,
});
export type ReservationActionResponse = z.infer<typeof reservationActionResponseSchema>;

export const reservationStateResponseSchema = z.object({
  cardId: z.string().uuid(),
  state: reservationStateSchema,
  reservationId: z.string().uuid().nullable(),
  reserverId: z.string().uuid().nullable(),
  closeReason: reservationCloseReasonSchema.nullable(),
});
export type ReservationStateResponse = z.infer<typeof reservationStateResponseSchema>;
