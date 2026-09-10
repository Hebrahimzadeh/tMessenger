import type { Prisma, PrismaClient } from '@taavon/database';
import type { CardLinkInput, CardLocationInput } from '@taavon/contracts';
import type { CardAttachmentRecord, CardListRow, CardRecord, CardRepository } from './card.service';
import type { AttachmentRecord, AttachmentRepository } from './attachment.service';

const CARD_INCLUDE = {
  revisions: { orderBy: { revisionNumber: 'desc' as const }, take: 1 },
  semanticProfile: true,
  attachments: true,
};

type CardWithRelations = Prisma.CardGetPayload<{ include: typeof CARD_INCLUDE }>;

function toAttachmentRecord(row: CardWithRelations['attachments'][number]): CardAttachmentRecord {
  return {
    id: row.id,
    cardId: row.cardId,
    ownerId: row.ownerId,
    kind: row.kind,
    status: row.status,
    objectKey: row.objectKey,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    linkUrl: row.linkUrl,
    locationLabel: row.locationLabel,
    approxLat: row.approxLat,
    approxLng: row.approxLng,
  };
}

function toCardRecord(card: CardWithRelations): CardRecord {
  const revision = card.revisions[0]!;
  return {
    id: card.id,
    spaceId: card.spaceId,
    authorId: card.authorId,
    kind: card.kind,
    status: card.status,
    publishedAt: card.publishedAt,
    latestRevision: {
      revisionNumber: revision.revisionNumber,
      title: revision.title,
      body: revision.body,
    },
    inferredKind: card.semanticProfile?.inferredKind ?? card.kind,
    attachments: card.attachments.map(toAttachmentRecord),
  };
}

/**
 * Links previously-uploaded file attachments to a card and materializes the
 * inline LINK / APPROXIMATE_LOCATION attachments - "link و موقعیت تقریبی
 * بدون واکشی server-side URL ذخیره شوند": the url and label are persisted
 * exactly as received, the server never fetches them. Runs inside an
 * already-open transaction.
 *
 * A file id that isn't the author's, isn't READY, or is already attached
 * elsewhere is left untouched by the `updateMany` filter; the count
 * mismatch then rolls the whole transaction back, so a card can never end
 * up half-built.
 */
async function attachAll(
  tx: Prisma.TransactionClient,
  cardId: string,
  authorId: string,
  fileAttachmentIds: string[],
  links: CardLinkInput[],
  locations: CardLocationInput[]
): Promise<void> {
  if (fileAttachmentIds.length > 0) {
    const linked = await tx.cardAttachment.updateMany({
      where: { id: { in: fileAttachmentIds }, ownerId: authorId, status: 'READY', cardId: null },
      data: { cardId },
    });
    if (linked.count !== fileAttachmentIds.length) {
      throw new Error('CARD_ATTACHMENT_LINK_CONFLICT');
    }
  }

  for (const link of links) {
    await tx.cardAttachment.create({
      data: {
        cardId,
        ownerId: authorId,
        kind: 'LINK',
        status: 'READY',
        linkUrl: link.url,
        locationLabel: link.label ?? null,
      },
    });
  }

  for (const location of locations) {
    await tx.cardAttachment.create({
      data: {
        cardId,
        ownerId: authorId,
        kind: 'APPROXIMATE_LOCATION',
        status: 'READY',
        locationLabel: location.label,
        approxLat: location.approxLat ?? null,
        approxLng: location.approxLng ?? null,
      },
    });
  }
}

export function createPrismaCardRepository(prisma: PrismaClient): CardRepository {
  return {
    async getSpaceStatus(spaceId) {
      const space = await prisma.space.findUnique({ where: { id: spaceId }, select: { status: true } });
      return space?.status ?? null;
    },

    async findAttachmentsByIds(ids) {
      if (ids.length === 0) return [];
      const rows = await prisma.cardAttachment.findMany({ where: { id: { in: ids } } });
      return rows.map(toAttachmentRecord);
    },

    async createCard(input) {
      return prisma.$transaction(async (tx) => {
        const card = await tx.card.create({
          data: {
            spaceId: input.spaceId,
            authorId: input.authorId,
            kind: input.kind,
            status: 'ACTIVE',
          },
          select: { id: true },
        });

        await tx.cardRevision.create({
          data: {
            cardId: card.id,
            revisionNumber: 1,
            title: input.title,
            body: input.body,
            editorId: input.authorId,
          },
        });

        await tx.cardSemanticProfile.create({
          data: { cardId: card.id, inferredKind: input.inferredKind, confidence: input.confidence },
        });

        await attachAll(tx, card.id, input.authorId, input.fileAttachmentIds, input.links, input.locations);

        await tx.cardEvent.create({
          data: {
            cardId: card.id,
            eventType: 'card.created',
            actorId: input.authorId,
            payload: { kind: input.kind, revisionNumber: 1 },
          },
        });
        await tx.outboxEvent.create({
          data: {
            aggregateType: 'Card',
            aggregateId: card.id,
            eventType: 'card.created',
            payload: { cardId: card.id, spaceId: input.spaceId, authorId: input.authorId },
          },
        });

        return { id: card.id };
      });
    },

    async addRevision(input) {
      return prisma.$transaction(async (tx) => {
        const latest = await tx.cardRevision.findFirst({
          where: { cardId: input.cardId },
          orderBy: { revisionNumber: 'desc' },
          select: { revisionNumber: true },
        });
        const revisionNumber = (latest?.revisionNumber ?? 0) + 1;

        await tx.cardRevision.create({
          data: {
            cardId: input.cardId,
            revisionNumber,
            title: input.title,
            body: input.body,
            editorId: input.editorId,
          },
        });

        await tx.card.update({ where: { id: input.cardId }, data: { kind: input.kind } });

        await tx.cardSemanticProfile.upsert({
          where: { cardId: input.cardId },
          create: { cardId: input.cardId, inferredKind: input.inferredKind, confidence: input.confidence },
          update: { inferredKind: input.inferredKind, confidence: input.confidence },
        });

        await attachAll(tx, input.cardId, input.editorId, input.fileAttachmentIds, input.links, input.locations);

        await tx.cardEvent.create({
          data: {
            cardId: input.cardId,
            eventType: 'card.revised',
            actorId: input.editorId,
            payload: { kind: input.kind, revisionNumber },
          },
        });
        await tx.outboxEvent.create({
          data: {
            aggregateType: 'Card',
            aggregateId: input.cardId,
            eventType: 'card.revised',
            payload: { cardId: input.cardId, revisionNumber, editorId: input.editorId },
          },
        });

        return { revisionNumber };
      });
    },

    async findCard(cardId) {
      const card = await prisma.card.findUnique({ where: { id: cardId }, include: CARD_INCLUDE });
      return card && card.revisions.length > 0 ? toCardRecord(card) : null;
    },

    async listCards(spaceId, { limit, before }) {
      const rows = await prisma.card.findMany({
        where: {
          spaceId,
          status: 'ACTIVE',
          ...(before
            ? {
                OR: [
                  { publishedAt: { lt: new Date(before.publishedAt) } },
                  { publishedAt: new Date(before.publishedAt), id: { lt: before.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        take: limit,
        include: {
          revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 },
          _count: { select: { attachments: true } },
        },
      });

      return rows.map<CardListRow>((card) => {
        const revision = card.revisions[0]!;
        return {
          id: card.id,
          authorId: card.authorId,
          kind: card.kind,
          publishedAt: card.publishedAt,
          title: revision.title,
          body: revision.body,
          attachmentCount: card._count.attachments,
        };
      });
    },
  };
}

function toAttachmentServiceRecord(row: {
  id: string;
  ownerId: string;
  kind: AttachmentRecord['kind'] | 'LINK' | 'APPROXIMATE_LOCATION';
  status: AttachmentRecord['status'];
  objectKey: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  rejectionReason: string | null;
}): AttachmentRecord {
  return {
    id: row.id,
    ownerId: row.ownerId,
    // The upload/finalize flow only ever touches the four uploadable kinds;
    // LINK / APPROXIMATE_LOCATION rows are created already-READY and never
    // reach this repository.
    kind: row.kind as AttachmentRecord['kind'],
    status: row.status,
    objectKey: row.objectKey,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    rejectionReason: row.rejectionReason,
  };
}

export function createPrismaAttachmentRepository(prisma: PrismaClient): AttachmentRepository {
  return {
    async createPending({ ownerId, kind, objectKey }) {
      const row = await prisma.cardAttachment.create({
        data: { ownerId, kind, status: 'PENDING', objectKey },
        select: { id: true },
      });
      return { id: row.id };
    },

    async findById(id) {
      const row = await prisma.cardAttachment.findUnique({ where: { id } });
      return row ? toAttachmentServiceRecord(row) : null;
    },

    async markProcessing(id, data) {
      await prisma.cardAttachment.update({
        where: { id },
        data: {
          status: 'PROCESSING',
          objectKey: data.objectKey,
          contentType: data.contentType,
          sizeBytes: data.sizeBytes,
          checksumSha256: data.checksumSha256,
        },
      });
    },

    async markReady(id) {
      await prisma.cardAttachment.update({ where: { id }, data: { status: 'READY' } });
    },

    async markRejected(id, reason) {
      await prisma.cardAttachment.update({ where: { id }, data: { status: 'REJECTED', rejectionReason: reason } });
    },
  };
}
