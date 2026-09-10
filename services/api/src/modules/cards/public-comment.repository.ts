import type { PrismaClient } from '@taavon/database';
import { logAwarenessEvent } from '../../lib/awareness-events';
import type { CommentRecord, CommentRepository } from './public-comment.service';

type CommentRow = {
  id: string;
  cardId: string;
  authorId: string;
  parentId: string | null;
  status: 'VISIBLE' | 'DELETED';
  createdAt: Date;
  updatedAt: Date;
  revisions: { revisionNumber: number; body: string }[];
};

function toRecord(row: CommentRow): CommentRecord {
  const latest = row.revisions[0];
  return {
    id: row.id,
    cardId: row.cardId,
    authorId: row.authorId,
    parentId: row.parentId,
    status: row.status,
    latestBody: latest?.body ?? '',
    revisionCount: row.revisions.length,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const LATEST_REVISION = { revisions: { orderBy: { revisionNumber: 'desc' as const }, take: 1 } };
const ALL_REVISION_NUMBERS = {
  revisions: { orderBy: { revisionNumber: 'desc' as const }, select: { revisionNumber: true, body: true } },
};

async function loadComment(prisma: PrismaClient, commentId: string): Promise<CommentRecord | null> {
  const row = await prisma.cardComment.findUnique({ where: { id: commentId }, include: ALL_REVISION_NUMBERS });
  return row ? toRecord(row as CommentRow) : null;
}

export async function isSpaceEditor(prisma: PrismaClient, userId: string, spaceId: string): Promise<boolean> {
  const space = await prisma.space.findUnique({ where: { id: spaceId }, select: { creatorId: true } });
  if (!space) return false;
  if (space.creatorId === userId) return true;
  const admin = await prisma.roleAssignment.findFirst({
    where: { userId, scopeType: 'SPACE', scopeId: spaceId, role: { key: 'SPACE_ADMIN' } },
    select: { id: true },
  });
  return admin !== null;
}

export function createPrismaCommentRepository(prisma: PrismaClient): CommentRepository {
  return {
    async getCardContext(cardId) {
      const card = await prisma.card.findUnique({
        where: { id: cardId },
        select: { status: true, spaceId: true, space: { select: { status: true } } },
      });
      return card ? { cardStatus: card.status, spaceStatus: card.space.status, spaceId: card.spaceId } : null;
    },

    isSpaceEditor(userId, spaceId) {
      return isSpaceEditor(prisma, userId, spaceId);
    },

    findComment(commentId) {
      return loadComment(prisma, commentId);
    },

    async createComment({ cardId, authorId, parentId, body }) {
      const { id } = await prisma.$transaction(async (tx) => {
        const comment = await tx.cardComment.create({ data: { cardId, authorId, parentId }, select: { id: true } });
        await tx.cardCommentRevision.create({ data: { commentId: comment.id, revisionNumber: 1, body, editorId: authorId } });
        await tx.cardEvent.create({
          data: { cardId, eventType: 'card.comment_created', actorId: authorId, payload: { commentId: comment.id, parentId } },
        });
        await tx.outboxEvent.create({
          data: {
            aggregateType: 'Card',
            aggregateId: cardId,
            eventType: 'card.comment_created',
            payload: { cardId, commentId: comment.id, authorId },
          },
        });
        await logAwarenessEvent(tx, {
          type: 'PUBLIC_CONTRIBUTION',
          actorId: authorId,
          subjectId: cardId,
          deepLink: `/cards/${cardId}`,
          idempotencyKey: `comment:${comment.id}:PUBLIC_CONTRIBUTION`,
        });
        return comment;
      });
      return (await loadComment(prisma, id))!;
    },

    async addRevision({ commentId, editorId, body }) {
      await prisma.$transaction(async (tx) => {
        const latest = await tx.cardCommentRevision.findFirst({
          where: { commentId },
          orderBy: { revisionNumber: 'desc' },
          select: { revisionNumber: true },
        });
        const revisionNumber = (latest?.revisionNumber ?? 0) + 1;
        await tx.cardCommentRevision.create({ data: { commentId, revisionNumber, body, editorId } });
        const comment = await tx.cardComment.update({
          where: { id: commentId },
          data: { updatedAt: new Date() },
          select: { cardId: true },
        });
        await tx.cardEvent.create({
          data: { cardId: comment.cardId, eventType: 'card.comment_edited', actorId: editorId, payload: { commentId, revisionNumber } },
        });
      });
      return (await loadComment(prisma, commentId))!;
    },

    async softDelete({ commentId, actorId, correlationId }) {
      await prisma.$transaction(async (tx) => {
        const comment = await tx.cardComment.update({
          where: { id: commentId },
          data: { status: 'DELETED', deletedAt: new Date() },
          select: { cardId: true },
        });
        await tx.cardEvent.create({
          data: { cardId: comment.cardId, eventType: 'card.comment_deleted', actorId, payload: { commentId } },
        });
        await tx.auditEvent.create({
          data: {
            actorId,
            action: 'card.comment_deleted',
            targetType: 'CardComment',
            targetId: commentId,
            correlationId,
            metadata: { cardId: comment.cardId },
          },
        });
      });
    },

    async listByCard(cardId, { limit, before }) {
      const rows = await prisma.cardComment.findMany({
        where: {
          cardId,
          ...(before
            ? {
                OR: [
                  { createdAt: { gt: new Date(before.createdAt) } },
                  { createdAt: new Date(before.createdAt), id: { gt: before.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: limit,
        include: LATEST_REVISION,
      });
      return rows.map((row) => toRecord(row as CommentRow));
    },
  };
}
