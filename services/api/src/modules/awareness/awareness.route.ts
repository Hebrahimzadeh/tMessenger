import type { FastifyInstance } from 'fastify';
import { participationListResponseSchema, recordCardViewResponseSchema } from '@taavon/contracts';
import { apiError } from '../../lib/api-error';
import { requireSession } from '../auth/session-guard';
import { createPrismaAwarenessRepository } from './awareness.repository';
import {
  CardNotFoundForViewError,
  InvalidParticipationCursorError,
  listMyParticipations,
  recordMeaningfulView,
  type AwarenessRepository,
} from './awareness.service';

export interface AwarenessRouteOptions {
  sessionHmacKey: string;
  awarenessRepository?: AwarenessRepository;
}

const DEFAULT_PARTICIPATION_LIMIT = 20;
const MAX_PARTICIPATION_LIMIT = 50;

export async function awarenessRoutes(app: FastifyInstance, opts: AwarenessRouteOptions) {
  function repo(): AwarenessRepository {
    return opts.awarenessRepository ?? createPrismaAwarenessRepository(app.db);
  }

  app.post('/cards/:cardId/views', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const { cardId } = request.params as { cardId: string };

    try {
      const result = await recordMeaningfulView(repo(), cardId, user.userId);
      return recordCardViewResponseSchema.parse(result);
    } catch (err) {
      if (err instanceof CardNotFoundForViewError) {
        return reply.code(404).send(apiError(request, 'CARD_NOT_FOUND', 'این کارت یافت نشد.'));
      }
      throw err;
    }
  });

  // "GET /v1/me/participations?cursor=&limit=20 فقط ترتیب زمانی نزولی و
  // بدون پارامتر category/status/filter/search" - `limit`/`cursor` are the
  // only query parameters this route ever reads.
  app.get('/me/participations', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const query = request.query as { cursor?: string; limit?: string };
    const requestedLimit = query.limit ? Number.parseInt(query.limit, 10) : DEFAULT_PARTICIPATION_LIMIT;
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), MAX_PARTICIPATION_LIMIT) : DEFAULT_PARTICIPATION_LIMIT;

    try {
      const result = await listMyParticipations(repo(), user.userId, { limit, cursor: query.cursor });
      return participationListResponseSchema.parse({
        items: result.items.map((item) => ({ type: item.type, createdAt: item.createdAt.toISOString(), deepLink: item.deepLink })),
        nextCursor: result.nextCursor,
      });
    } catch (err) {
      if (err instanceof InvalidParticipationCursorError) {
        return reply.code(400).send(apiError(request, 'INVALID_CURSOR', 'نشانگر صفحه‌بندی معتبر نیست.'));
      }
      throw err;
    }
  });
}
