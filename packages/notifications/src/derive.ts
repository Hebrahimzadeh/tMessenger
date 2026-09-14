export type NotificationType =
  | 'NEW_PUBLIC_REPLY'
  | 'RESERVATION_CHANGED'
  | 'NEW_PRIVATE_MESSAGE'
  | 'MODERATION_UPDATE'
  | 'SPACE_GUIDANCE';

/** One notification to create. Carries no content - see `subjectId`. */
export interface NotificationIntent {
  recipientId: string;
  type: NotificationType;
  /**
   * Identifies the event, not the delivery attempt. Two replays of the same
   * outbox row must produce the same key, and two genuinely different events
   * must not - that is the entire mechanism behind "at-least-once and
   * idempotent", enforced by a unique index rather than by the consumer
   * remembering what it has already done.
   */
  dedupKey: string;
  subjectType: string;
  subjectId: string;
  deepLink: string;
}

/** The outbox row shape this consumer reads. */
export interface OutboxEventInput {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
}

/**
 * Who should hear about an event. Supplied by the caller rather than read
 * here, so this module stays pure and directly testable: the interesting
 * decisions are which events notify, whom, and under what key, and none of
 * them should need a database to verify.
 */
export interface AudienceLookup {
  /** Everyone following the card's thread who should hear about a new reply, minus the author. */
  publicReplyAudience: (cardId: string, actorId: string) => Promise<string[]>;
  /** The people a reservation change concerns: the card's owner and the reserver, minus whoever acted. */
  reservationAudience: (cardId: string, actorId: string | null) => Promise<string[]>;
  /** The space's own people, for guidance that concerns the space rather than one card. */
  spaceAudience: (spaceId: string) => Promise<string[]>;
}

function asRecord(payload: unknown): Record<string, unknown> {
  return typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Turns one outbox event into the notifications it should produce.
 *
 * Deliberately total and deliberately quiet: an event type nobody subscribes
 * to yields an empty list rather than an error, because the outbox is a
 * general-purpose log that other consumers also read, and a notification
 * consumer that threw on an unfamiliar event would block the queue for
 * everyone. An unrecognised event is not a failure; it simply is not news.
 *
 * NEW_PRIVATE_MESSAGE is deliberately absent. Private messages write no
 * outbox row at all - Task 19's canary asserts exactly that - so their
 * notification is created in the same transaction as the message itself.
 * Routing them through here would put a record of private correspondence in
 * a general-purpose log that other consumers read.
 */
export async function deriveNotifications(
  event: OutboxEventInput,
  audience: AudienceLookup
): Promise<NotificationIntent[]> {
  const payload = asRecord(event.payload);

  if (event.eventType === 'card.comment_created') {
    const cardId = str(payload.cardId) ?? event.aggregateId;
    const commentId = str(payload.commentId);
    const authorId = str(payload.authorId);
    if (!commentId || !authorId) return [];

    const recipients = await audience.publicReplyAudience(cardId, authorId);
    return recipients.map((recipientId) => ({
      recipientId,
      type: 'NEW_PUBLIC_REPLY' as const,
      // Keyed on the comment and the recipient: replaying this row produces
      // the same key, while a second comment produces a different one.
      dedupKey: `NEW_PUBLIC_REPLY:${commentId}:${recipientId}`,
      subjectType: 'CardComment',
      subjectId: commentId,
      deepLink: `/cards/${cardId}`,
    }));
  }

  if (event.eventType.startsWith('card.reservation_')) {
    const cardId = str(payload.cardId) ?? event.aggregateId;
    const reservationId = str(payload.reservationId);
    const actorId = str(payload.actorId);
    if (!reservationId) return [];

    const recipients = await audience.reservationAudience(cardId, actorId);
    return recipients.map((recipientId) => ({
      recipientId,
      type: 'RESERVATION_CHANGED' as const,
      // The state is part of the key: a reservation moving to IN_USE and
      // later to closed are two different pieces of news about one
      // reservation, and both should arrive.
      dedupKey: `RESERVATION_CHANGED:${reservationId}:${event.eventType}:${recipientId}`,
      subjectType: 'CardReservation',
      subjectId: reservationId,
      deepLink: `/cards/${cardId}`,
    }));
  }

  if (event.eventType === 'space.guidance_ready') {
    const spaceId = str(payload.spaceId) ?? event.aggregateId;
    const recipients = await audience.spaceAudience(spaceId);
    return recipients.map((recipientId) => ({
      recipientId,
      type: 'SPACE_GUIDANCE' as const,
      dedupKey: `SPACE_GUIDANCE:${event.id}:${recipientId}`,
      subjectType: 'Space',
      subjectId: spaceId,
      deepLink: `/spaces/${spaceId}`,
    }));
  }

  if (event.eventType.startsWith('moderation.')) {
    const subjectUserId = str(payload.subjectUserId);
    if (!subjectUserId) return [];

    return [
      {
        recipientId: subjectUserId,
        type: 'MODERATION_UPDATE' as const,
        dedupKey: `MODERATION_UPDATE:${event.id}:${subjectUserId}`,
        subjectType: str(payload.subjectType) ?? event.aggregateType,
        subjectId: str(payload.subjectId) ?? event.aggregateId,
        deepLink: '/notifications',
      },
    ];
  }

  return [];
}

/** The hard ceiling on a preview, wherever one is rendered. */
export const PREVIEW_MAX_CHARS = 80;

/**
 * Trims text to the preview ceiling on a word boundary where it can.
 *
 * Only ever applied to text read from its own source at request time, for a
 * reader already entitled to it. Nothing calls this on the way *into* the
 * database - a preview is never stored, which is what keeps private message
 * text confined to messaging storage.
 */
export function toPreview(text: string, max: number = PREVIEW_MAX_CHARS): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= max) return collapsed;

  const cut = collapsed.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  // Only break on a word if that leaves most of the budget used; otherwise a
  // long unbroken string would collapse to almost nothing.
  const body = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${body.trimEnd()}…`;
}
