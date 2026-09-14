import type { PrismaClient } from '@taavon/database';
import type { AudienceLookup, NotificationIntent, OutboxEventInput } from './derive';
import type { NotificationJobRepository } from './job';

/**
 * Who hears about what, read from the database.
 *
 * Every lookup here excludes whoever caused the event. Telling someone their
 * own comment was posted is noise, and noise is what makes people stop
 * reading notifications at all.
 */
export function createPrismaAudienceLookup(prisma: PrismaClient): AudienceLookup {
  return {
    async publicReplyAudience(cardId, actorId) {
      const card = await prisma.card.findUnique({ where: { id: cardId }, select: { authorId: true } });
      const commenters = await prisma.cardComment.findMany({
        where: { cardId, status: 'VISIBLE' },
        select: { authorId: true },
        distinct: ['authorId'],
      });

      const everyone = new Set<string>(commenters.map((c) => c.authorId));
      if (card?.authorId) everyone.add(card.authorId);
      everyone.delete(actorId);
      return [...everyone];
    },

    async reservationAudience(cardId, actorId) {
      const card = await prisma.card.findUnique({ where: { id: cardId }, select: { authorId: true } });
      const reservation = await prisma.cardReservation.findFirst({
        where: { cardId },
        orderBy: { reservedAt: 'desc' },
        select: { reserverId: true },
      });

      const everyone = new Set<string>();
      if (card?.authorId) everyone.add(card.authorId);
      if (reservation?.reserverId) everyone.add(reservation.reserverId);
      if (actorId) everyone.delete(actorId);
      return [...everyone];
    },

    async spaceAudience(spaceId) {
      const space = await prisma.space.findUnique({ where: { id: spaceId }, select: { creatorId: true } });
      const members = await prisma.spaceRoleMembership.findMany({
        where: { spaceId },
        select: { userId: true },
        distinct: ['userId'],
      });

      const everyone = new Set<string>(members.map((m) => m.userId));
      if (space?.creatorId) everyone.add(space.creatorId);
      return [...everyone];
    },
  };
}

export function createPrismaNotificationJobRepository(prisma: PrismaClient): NotificationJobRepository {
  return {
    audience: createPrismaAudienceLookup(prisma),

    async claimUnprocessed(limit): Promise<OutboxEventInput[]> {
      const rows = await prisma.outboxEvent.findMany({
        where: { processedAt: null, availableAt: { lte: new Date() } },
        orderBy: { availableAt: 'asc' },
        take: limit,
        select: { id: true, aggregateType: true, aggregateId: true, eventType: true, payload: true },
      });
      return rows;
    },

    async createIfNew(intent: NotificationIntent): Promise<boolean> {
      try {
        await prisma.$transaction(async (tx) => {
          const notification = await tx.notification.create({
            data: {
              recipientId: intent.recipientId,
              type: intent.type,
              dedupKey: intent.dedupKey,
              subjectType: intent.subjectType,
              subjectId: intent.subjectId,
              deepLink: intent.deepLink,
            },
            select: { id: true },
          });
          // IN_APP is the only channel, and it is delivered the moment it is
          // stored - there is nothing to send anywhere.
          await tx.notificationDelivery.create({
            data: { notificationId: notification.id, channel: 'IN_APP', deliveredAt: new Date() },
          });
        });
        return true;
      } catch (err) {
        // A replay collided with the unique dedupKey, which is the intended
        // outcome rather than a failure. Anything else is real and rethrown,
        // so the event stays unprocessed and is retried.
        if (isUniqueViolation(err)) return false;
        throw err;
      }
    },

    async markProcessed(outboxEventId) {
      await prisma.outboxEvent.update({ where: { id: outboxEventId }, data: { processedAt: new Date() } });
    },

    async recordAttempt(outboxEventId) {
      // Backs the row off so a persistently bad event does not spin on every
      // run, while still being retried rather than dropped.
      const row = await prisma.outboxEvent.findUnique({ where: { id: outboxEventId }, select: { attempts: true } });
      const attempts = (row?.attempts ?? 0) + 1;
      const backoffSeconds = Math.min(2 ** attempts, 3600);
      await prisma.outboxEvent.update({
        where: { id: outboxEventId },
        data: { attempts, availableAt: new Date(Date.now() + backoffSeconds * 1000) },
      });
    },
  };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002';
}
