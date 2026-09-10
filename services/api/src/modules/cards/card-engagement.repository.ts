import type { PrismaClient } from '@taavon/database';
import type { CardReactionType } from '@taavon/contracts';
import type { ReactionRepository, ReactionSummary } from './reaction.service';
import type { PinnedCardRecord, PinRepository } from './pin.service';
import { isSpaceEditor } from './public-comment.repository';

const EMPTY_COUNTS = { SUPPORT: 0, USEFUL: 0, INTERESTED: 0, CELEBRATE: 0 };

export function createPrismaReactionRepository(prisma: PrismaClient): ReactionRepository {
  return {
    async getCardContext(cardId) {
      const card = await prisma.card.findUnique({
        where: { id: cardId },
        select: { status: true, space: { select: { status: true } } },
      });
      return card ? { cardStatus: card.status, spaceStatus: card.space.status } : null;
    },

    async toggle(cardId, userId, type) {
      return prisma.$transaction(async (tx) => {
        const existing = await tx.cardReaction.findUnique({
          where: { cardId_userId_type: { cardId, userId, type } },
          select: { id: true },
        });
        if (existing) {
          await tx.cardReaction.delete({ where: { id: existing.id } });
          return 'removed';
        }
        await tx.cardReaction.create({ data: { cardId, userId, type } });
        return 'added';
      });
    },

    async summary(cardId, userId): Promise<ReactionSummary> {
      const grouped = await prisma.cardReaction.groupBy({ by: ['type'], where: { cardId }, _count: { _all: true } });
      const counts = { ...EMPTY_COUNTS };
      for (const row of grouped) counts[row.type] = row._count._all;

      const mine = userId
        ? (await prisma.cardReaction.findMany({ where: { cardId, userId }, select: { type: true } })).map(
            (r) => r.type as CardReactionType
          )
        : [];

      return { counts, mine };
    },
  };
}

export function createPrismaPinRepository(prisma: PrismaClient): PinRepository {
  return {
    async getCardContext(cardId) {
      const card = await prisma.card.findUnique({
        where: { id: cardId },
        select: { spaceId: true, status: true, space: { select: { status: true } } },
      });
      return card ? { spaceId: card.spaceId, cardStatus: card.status, spaceStatus: card.space.status } : null;
    },

    isSpaceEditor(userId, spaceId) {
      return isSpaceEditor(prisma, userId, spaceId);
    },

    countPins(spaceId) {
      return prisma.cardPin.count({ where: { spaceId } });
    },

    async isPinned(cardId) {
      const pin = await prisma.cardPin.findUnique({ where: { cardId }, select: { id: true } });
      return pin !== null;
    },

    async pin({ spaceId, cardId, pinnedById, position, correlationId }) {
      await prisma.$transaction(async (tx) => {
        await tx.cardPin.create({ data: { spaceId, cardId, pinnedById, position } });
        await tx.auditEvent.create({
          data: {
            actorId: pinnedById,
            action: 'card.pinned',
            targetType: 'Card',
            targetId: cardId,
            correlationId,
            metadata: { spaceId, position },
          },
        });
      });
    },

    async unpin({ spaceId, cardId, actorId, correlationId }) {
      return prisma.$transaction(async (tx) => {
        const removed = await tx.cardPin.deleteMany({ where: { spaceId, cardId } });
        if (removed.count === 0) return false;
        await tx.auditEvent.create({
          data: {
            actorId,
            action: 'card.unpinned',
            targetType: 'Card',
            targetId: cardId,
            correlationId,
            metadata: { spaceId },
          },
        });
        return true;
      });
    },

    async list(spaceId): Promise<PinnedCardRecord[]> {
      const pins = await prisma.cardPin.findMany({
        where: { spaceId },
        orderBy: { position: 'asc' },
        include: { card: { include: { revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 } } } },
      });
      return pins.map((pin) => ({
        cardId: pin.cardId,
        position: pin.position,
        title: pin.card.revisions[0]?.title ?? '',
        pinnedAt: pin.createdAt,
      }));
    },
  };
}
