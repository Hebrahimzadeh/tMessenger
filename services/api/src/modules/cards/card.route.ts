import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  cardListResponseSchema,
  cardResponseSchema,
  createCardBodySchema,
  finalizeAttachmentResponseSchema,
  updateCardBodySchema,
  uploadIntentBodySchema,
  uploadIntentResponseSchema,
} from '@taavon/contracts';
import { apiError } from '../../lib/api-error';
import { getOptionalSession, requireSession } from '../auth/session-guard';
import type { StorageProvider } from '../storage/storage-provider';
import {
  AttachmentNotAwaitingFinalizeError,
  AttachmentNotFoundError,
  createUploadIntent,
  finalizeAttachment,
  NotAttachmentOwnerError,
  type AttachmentRepository,
} from './attachment.service';
import { createPrismaAttachmentRepository, createPrismaCardRepository } from './card.repository';
import {
  createCard,
  CardNotFoundError,
  getCard,
  InvalidAttachmentReferenceError,
  InvalidCardCursorError,
  listCards,
  NotCardEditorError,
  SpaceNotAcceptingCardsError,
  SpaceNotFoundForCardError,
  updateCard,
  type CardRecord,
  type CardRepository,
} from './card.service';

export interface CardRouteOptions {
  sessionHmacKey: string;
  storageProvider: StorageProvider;
  cardRepository?: CardRepository;
  attachmentRepository?: AttachmentRepository;
}

const LIST_PAGE_SIZE = 20;

async function toCardResponse(card: CardRecord, storage: StorageProvider) {
  // "فایل READYنشده در کارت نمایش داده نشود؛ فایل rejected هرگز signed read
  // URL نگیرد" - only READY attachments are rendered at all, and a signed
  // URL is minted solely for one that has an object key (a stored file);
  // LINK / APPROXIMATE_LOCATION rows carry no key and get readUrl: null.
  const attachments = await Promise.all(
    card.attachments
      .filter((attachment) => attachment.status === 'READY')
      .map(async (attachment) => ({
        id: attachment.id,
        kind: attachment.kind,
        status: attachment.status,
        contentType: attachment.contentType,
        sizeBytes: attachment.sizeBytes,
        readUrl: attachment.objectKey ? await storage.getSignedRead(attachment.objectKey) : null,
        linkUrl: attachment.linkUrl,
        locationLabel: attachment.locationLabel,
        approxLat: attachment.approxLat,
        approxLng: attachment.approxLng,
      }))
  );

  return cardResponseSchema.parse({
    id: card.id,
    spaceId: card.spaceId,
    authorId: card.authorId,
    kind: card.kind,
    status: card.status,
    publishedAt: card.publishedAt.toISOString(),
    revision: {
      revisionNumber: card.latestRevision.revisionNumber,
      title: card.latestRevision.title,
      body: card.latestRevision.body,
    },
    inferredKind: card.inferredKind,
    attachments,
  });
}

export async function cardRoutes(app: FastifyInstance, opts: CardRouteOptions) {
  function repo(): CardRepository {
    return opts.cardRepository ?? createPrismaCardRepository(app.db);
  }
  function attachmentRepo(): AttachmentRepository {
    return opts.attachmentRepository ?? createPrismaAttachmentRepository(app.db);
  }

  app.post('/spaces/:spaceId/cards', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const { spaceId } = request.params as { spaceId: string };
    const body = createCardBodySchema.parse(request.body);

    try {
      const { id } = await createCard(repo(), {
        spaceId,
        authorId: user.userId,
        body: body.body,
        title: body.title,
        kind: body.kind,
        attachmentIds: body.attachmentIds,
        links: body.links,
        locations: body.locations,
      });
      const card = await repo().findCard(id);
      return reply.code(201).send(await toCardResponse(card!, opts.storageProvider));
    } catch (err) {
      return handleCardWriteError(err, request, reply);
    }
  });

  app.get('/spaces/:spaceId/cards', async (request, reply) => {
    const { spaceId } = request.params as { spaceId: string };
    const query = request.query as { cursor?: string };
    getOptionalSession(request, opts.sessionHmacKey); // public list; no gate beyond the space being published

    try {
      const result = await listCards(repo(), spaceId, { limit: LIST_PAGE_SIZE, cursor: query.cursor });
      return cardListResponseSchema.parse({
        items: result.items.map((item) => ({
          id: item.id,
          authorId: item.authorId,
          kind: item.kind,
          publishedAt: item.publishedAt.toISOString(),
          title: item.title,
          body: item.body,
          attachmentCount: item.attachmentCount,
        })),
        nextCursor: result.nextCursor,
      });
    } catch (err) {
      if (err instanceof SpaceNotFoundForCardError) {
        return reply.code(404).send(apiError(request, 'SPACE_NOT_FOUND', 'این بستر یافت نشد.'));
      }
      if (err instanceof InvalidCardCursorError) {
        return reply.code(400).send(apiError(request, 'INVALID_CURSOR', 'نشانگر صفحه‌بندی معتبر نیست.'));
      }
      throw err;
    }
  });

  app.get('/cards/:cardId', async (request, reply) => {
    const { cardId } = request.params as { cardId: string };
    getOptionalSession(request, opts.sessionHmacKey);

    try {
      const card = await getCard(repo(), cardId);
      return toCardResponse(card, opts.storageProvider);
    } catch (err) {
      if (err instanceof CardNotFoundError) {
        return reply.code(404).send(apiError(request, 'CARD_NOT_FOUND', 'این کارت یافت نشد.'));
      }
      throw err;
    }
  });

  app.patch('/cards/:cardId', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const { cardId } = request.params as { cardId: string };
    const body = updateCardBodySchema.parse(request.body);

    try {
      await updateCard(repo(), cardId, user.userId, {
        body: body.body,
        title: body.title,
        kind: body.kind,
        attachmentIds: body.attachmentIds,
        links: body.links,
        locations: body.locations,
      });
      const card = await repo().findCard(cardId);
      return toCardResponse(card!, opts.storageProvider);
    } catch (err) {
      return handleCardWriteError(err, request, reply);
    }
  });

  app.post('/cards/attachments/upload-intent', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const body = uploadIntentBodySchema.parse(request.body);

    const result = await createUploadIntent(attachmentRepo(), user.userId, body.kind);
    return reply.code(201).send(uploadIntentResponseSchema.parse(result));
  });

  app.post('/cards/attachments/:attachmentId/finalize', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const { attachmentId } = request.params as { attachmentId: string };

    try {
      const outcome = await finalizeAttachment(attachmentRepo(), opts.storageProvider, attachmentId, user.userId);
      return finalizeAttachmentResponseSchema.parse(outcome);
    } catch (err) {
      if (err instanceof AttachmentNotFoundError) {
        return reply.code(404).send(apiError(request, 'ATTACHMENT_NOT_FOUND', 'این پیوست یافت نشد.'));
      }
      if (err instanceof NotAttachmentOwnerError) {
        return reply.code(403).send(apiError(request, 'FORBIDDEN', 'این پیوست متعلق به کاربر دیگری است.'));
      }
      if (err instanceof AttachmentNotAwaitingFinalizeError) {
        return reply
          .code(409)
          .send(apiError(request, 'ATTACHMENT_NOT_PROCESSING', 'این پیوست هنوز بارگذاری نشده یا پیش‌تر نهایی شده است.'));
      }
      throw err;
    }
  });
}

function handleCardWriteError(err: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (err instanceof SpaceNotFoundForCardError) {
    return reply.code(404).send(apiError(request, 'SPACE_NOT_FOUND', 'این بستر یافت نشد.'));
  }
  if (err instanceof SpaceNotAcceptingCardsError) {
    return reply
      .code(422)
      .send(apiError(request, 'SPACE_NOT_ACCEPTING_CARDS', 'این بستر در وضعیت فعلی پذیرای کارت جدید نیست.'));
  }
  if (err instanceof CardNotFoundError) {
    return reply.code(404).send(apiError(request, 'CARD_NOT_FOUND', 'این کارت یافت نشد.'));
  }
  if (err instanceof NotCardEditorError) {
    return reply.code(403).send(apiError(request, 'FORBIDDEN', 'فقط نویسندهٔ کارت می‌تواند آن را ویرایش کند.'));
  }
  if (err instanceof InvalidAttachmentReferenceError) {
    return reply
      .code(422)
      .send(apiError(request, 'INVALID_ATTACHMENT', 'پیوست انتخاب‌شده معتبر نیست یا کارت باید حداقل یک محتوا داشته باشد.'));
  }
  throw err;
}
