import type { FastifyInstance } from 'fastify';
import {
  spaceFollowActionResponseSchema,
  spaceSearchQuerySchema,
  spaceSearchResponseSchema,
  spaceSimilarQuerySchema,
  spaceSimilarResponseSchema,
} from '@taavon/contracts';
import { apiError } from '../../lib/api-error';
import { getOptionalSession, requireSession } from '../auth/session-guard';
import { createPrismaSpaceSearchRepository } from './space-search.repository';
import {
  followSpace,
  FollowingScopeRequiresSessionError,
  InvalidCursorError,
  searchSpaces,
  unfollowSpace,
  type SpaceSearchRepository,
} from './space-search.service';
import { createPrismaSpaceSimilarityRepository } from './space-similarity.repository';
import { findSimilarSpaces, type SpaceSimilarityRepository } from './space-similarity.service';

export interface SpaceSearchRouteOptions {
  sessionHmacKey: string;
  spaceSearchRepository?: SpaceSearchRepository;
  spaceSimilarityRepository?: SpaceSimilarityRepository;
}

export async function spaceSearchRoutes(app: FastifyInstance, opts: SpaceSearchRouteOptions) {
  function searchRepo(): SpaceSearchRepository {
    return opts.spaceSearchRepository ?? createPrismaSpaceSearchRepository(app.db);
  }
  function similarityRepo(): SpaceSimilarityRepository {
    return opts.spaceSimilarityRepository ?? createPrismaSpaceSimilarityRepository(app.db);
  }

  app.get('/', async (request, reply) => {
    const query = spaceSearchQuerySchema.parse(request.query);
    const user = getOptionalSession(request, opts.sessionHmacKey);

    if (query.scope === 'following' && !user) {
      return reply.code(401).send(apiError(request, 'SESSION_INVALID', 'برای دیدن بسترهای دنبال‌شده باید وارد شوید.'));
    }

    try {
      const result = await searchSpaces(searchRepo(), {
        query: query.q,
        scope: query.scope,
        userId: user?.userId ?? null,
        limit: query.limit,
        cursor: query.cursor,
      });
      return spaceSearchResponseSchema.parse({
        items: result.items.map((item) => ({ ...item, publishedAt: item.publishedAt.toISOString() })),
        nextCursor: result.nextCursor,
      });
    } catch (err) {
      if (err instanceof InvalidCursorError) {
        return reply.code(400).send(apiError(request, 'INVALID_CURSOR', 'صفحه‌بندی نامعتبر است.'));
      }
      if (err instanceof FollowingScopeRequiresSessionError) {
        return reply.code(401).send(apiError(request, 'SESSION_INVALID', 'برای دیدن بسترهای دنبال‌شده باید وارد شوید.'));
      }
      throw err;
    }
  });

  app.get('/similar', async (request) => {
    const query = spaceSimilarQuerySchema.parse(request.query);
    const items = await findSimilarSpaces(similarityRepo(), query.title, query.purpose);
    return spaceSimilarResponseSchema.parse({ items });
  });

  app.post('/:spaceId/follow', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const { spaceId } = request.params as { spaceId: string };

    await followSpace(searchRepo(), spaceId, user.userId);
    return spaceFollowActionResponseSchema.parse({ ok: true });
  });

  app.post('/:spaceId/unfollow', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const { spaceId } = request.params as { spaceId: string };

    await unfollowSpace(searchRepo(), spaceId, user.userId);
    return spaceFollowActionResponseSchema.parse({ ok: true });
  });
}
