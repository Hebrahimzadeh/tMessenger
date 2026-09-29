import type { PrismaClient } from '@taavon/database';
import type { CardReactionType } from '@taavon/contracts';
import type { ReactionRepository, ReactionSummary } from './reaction.service';
import type { BookmarkRepository } from './bookmark.service';
import type { PinnedCardRecord, PinRepository } from './pin.service';
import { CARD_LIST_INCLUDE, toListRows } from './card.repository';
import { isSpaceEditor } from './public-comment.repository';

const EMPTY_COUNTS = { LIKE: 0, SUPPORT: 0, USEFUL: 0, INTERESTED: 0, CELEBRATE: 0 };

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

/**
 * The bookmark table, which nobody but its owner ever reads.
 *
 * `listByUser` pages by the *bookmark's* own (createdAt, id), not the card's:
 * saving an old card puts it at the top of your shelf, which is what saving
 * it meant. Cards whose space stopped being public, or that were archived or
 * removed, drop out of the list while the bookmark row stays - nothing is
 * deleted behind the person's back, and a card that comes back is on their
 * shelf again.
 */
export function createPrismaBookmarkRepository(prisma: PrismaClient): BookmarkRepository {
  return {
    async getCardContext(cardId) {
      const card = await prisma.card.findUnique({
        where: { id: cardId },
        select: { status: true, space: { select: { status: true } } },
      });
      return card ? { cardStatus: card.status, spaceStatus: card.space.status } : null;
    },

    async toggle(cardId, userId) {
      return prisma.$transaction(async (tx) => {
        const existing = await tx.cardBookmark.findUnique({
          where: { cardId_userId: { cardId, userId } },
          select: { id: true },
        });
        if (existing) {
          await tx.cardBookmark.delete({ where: { id: existing.id } });
          return 'removed';
        }
        await tx.cardBookmark.create({ data: { cardId, userId } });
        return 'added';
      });
    },

    async isBookmarked(cardId, userId) {
      const found = await prisma.cardBookmark.findUnique({
        where: { cardId_userId: { cardId, userId } },
        select: { id: true },
      });
      return found !== null;
    },

    async listByUser(userId, { limit, before }) {
      const bookmarks = await prisma.cardBookmark.findMany({
        where: {
          userId,
          card: { status: 'ACTIVE', space: { status: 'PUBLISHED' } },
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
        include: { card: { include: CARD_LIST_INCLUDE } },
      });

      const rows = await toListRows(
        prisma,
        bookmarks.map((bookmark) => bookmark.card),
        userId
      );
      const last = bookmarks[bookmarks.length - 1];
      return { rows, lastBookmark: last ? { createdAt: last.createdAt, id: last.id } : null };
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
        caption: pin.card.revisions[0]?.body ?? '',
        pinnedAt: pin.createdAt,
      }));
    },
  };
}
