import type { PrismaClient } from '@taavon/database';
import { logAwarenessEvent } from '../../lib/awareness-events';
import type { AwarenessRepository, ParticipationItem } from './awareness.service';

export function createPrismaAwarenessRepository(prisma: PrismaClient): AwarenessRepository {
  return {
    async getCardAuthorId(cardId) {
      const card = await prisma.card.findUnique({ where: { id: cardId }, select: { authorId: true } });
      return card?.authorId ?? null;
    },

    async recordMeaningfulView(cardId, viewerId, deepLink) {
      await prisma.$transaction((tx) =>
        logAwarenessEvent(tx, {
          type: 'MEANINGFUL_VIEW',
          actorId: viewerId,
          subjectId: cardId,
          deepLink,
          idempotencyKey: `view:${cardId}:${viewerId}:MEANINGFUL_VIEW`,
        })
      );
    },

    async listByActor(actorId, { limit, before }) {
      const rows = await prisma.awarenessEvent.findMany({
        where: {
          actorId,
          ...(before
            ? {
                OR: [
                  { createdAt: { lt: new Date(before.createdAt) } },
                  { createdAt: new Date(before.createdAt), id: { lt: before.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
      });

      return rows.map<ParticipationItem & { id: string }>((row) => ({
        id: row.id,
        type: row.type,
        createdAt: row.createdAt,
        deepLink: row.deepLink,
      }));
    },
  };
}
