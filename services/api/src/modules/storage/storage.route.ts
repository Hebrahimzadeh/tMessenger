import type { FastifyInstance } from 'fastify';
import { finalizeAttachmentResponseSchema } from '@taavon/contracts';
import { apiError } from '../../lib/api-error';
import { requireSession } from '../auth/session-guard';
import {
  AttachmentNotAwaitingUploadError,
  AttachmentNotFoundError,
  MAX_ATTACHMENT_BYTES,
  NotAttachmentOwnerError,
  recordUpload,
  type AttachmentRepository,
} from '../cards/attachment.service';
import { createPrismaAttachmentRepository } from '../cards/card.repository';
import type { StorageProvider } from './storage-provider';

export interface StorageRouteOptions {
  sessionHmacKey: string;
  storageProvider: StorageProvider;
  attachmentRepository?: AttachmentRepository;
}

/**
 * The upload is server-proxied: the client PUTs the raw bytes here and the
 * API is what writes them to private object storage (there is no
 * client-facing presigned URL). This route is the only place a card
 * attachment's bytes ever enter the system, so it - together with
 * `recordUpload` - is where sniffing, sizing and checksumming happen.
 */
export async function storageRoutes(app: FastifyInstance, opts: StorageRouteOptions) {
  // Card media is binary; register a raw buffer parser scoped to this
  // plugin. The default 1 MiB body limit is far too small, so the route
  // below sets its own.
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));

  function repo(): AttachmentRepository {
    return opts.attachmentRepository ?? createPrismaAttachmentRepository(app.db);
  }

  app.post(
    '/uploads/:attachmentId',
    { bodyLimit: MAX_ATTACHMENT_BYTES + 4096 },
    async (request, reply) => {
      const user = requireSession(request, reply, opts.sessionHmacKey);
      if (!user) return;
      const { attachmentId } = request.params as { attachmentId: string };

      const body = request.body;
      if (!Buffer.isBuffer(body)) {
        return reply
          .code(415)
          .send(apiError(request, 'UNSUPPORTED_MEDIA_TYPE', 'بدنهٔ آپلود باید با نوع محتوای application/octet-stream ارسال شود.'));
      }

      try {
        const outcome = await recordUpload(repo(), opts.storageProvider, attachmentId, user.userId, body);
        return reply
          .code(outcome.status === 'REJECTED' ? 422 : 200)
          .send(finalizeAttachmentResponseSchema.parse(outcome));
      } catch (err) {
        if (err instanceof AttachmentNotFoundError) {
          return reply.code(404).send(apiError(request, 'ATTACHMENT_NOT_FOUND', 'این پیوست یافت نشد.'));
        }
        if (err instanceof NotAttachmentOwnerError) {
          return reply.code(403).send(apiError(request, 'FORBIDDEN', 'این پیوست متعلق به کاربر دیگری است.'));
        }
        if (err instanceof AttachmentNotAwaitingUploadError) {
          return reply
            .code(409)
            .send(apiError(request, 'ATTACHMENT_NOT_PENDING', 'برای این پیوست پیش‌تر فایلی بارگذاری شده است.'));
        }
        throw err;
      }
    }
  );
}
