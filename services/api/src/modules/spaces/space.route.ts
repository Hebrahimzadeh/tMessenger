import type { FastifyInstance } from 'fastify';
import {
  archiveSpaceResponseSchema,
  createSpaceBodySchema,
  createSpaceInviteResponseSchema,
  precheckSpaceResponseSchema,
  publishSpaceResponseSchema,
  resolveSpaceInviteResponseSchema,
  spaceHealthResponseSchema,
  spaceRoleMembershipActionResponseSchema,
  spaceResponseSchema,
  updateSpaceDefinitionBodySchema,
} from '@taavon/contracts';
import { apiError } from '../../lib/api-error';
import { getOptionalSession, requireSession } from '../auth/session-guard';
import { createPrismaSpaceHealthRepository, type SpaceHealthRepository } from '@taavon/space-health';
import { getSpaceHealth } from './space-health.service';
import { createPrismaSpaceRepository } from './space.repository';
import {
  archiveSpace,
  createSpace,
  createSpaceInvite,
  DuplicateRoleKeyError,
  GateNotAllowedError,
  getSpace,
  InviteNotFoundError,
  joinSpaceRole,
  leaveSpaceRole,
  NotSpaceEditorError,
  precheckSpace,
  publishSpace,
  resolveSpaceInvite,
  revokeSpaceInvite,
  RoleNotFoundError,
  SpaceNotEditableError,
  SpaceNotFoundError,
  updateSpaceDefinition,
  type SpaceRepository,
} from './space.service';

export interface SpaceRouteOptions {
  sessionHmacKey: string;
  spaceRepository?: SpaceRepository;
  spaceHealthRepository?: SpaceHealthRepository;
}

function toResponse(view: Awaited<ReturnType<typeof getSpace>>) {
  return spaceResponseSchema.parse({
    id: view.id,
    slug: view.slug,
    status: view.status,
    creatorId: view.creatorId,
    publishedAt: view.publishedAt?.toISOString() ?? null,
    archivedAt: view.archivedAt?.toISOString() ?? null,
    definition: view.definition,
    canManage: view.canManage,
    ...(view.gate ? { gate: view.gate } : {}),
  });
}

export async function spaceRoutes(app: FastifyInstance, opts: SpaceRouteOptions) {
  function repo(): SpaceRepository {
    return opts.spaceRepository ?? createPrismaSpaceRepository(app.db);
  }
  function healthRepo(): SpaceHealthRepository {
    return opts.spaceHealthRepository ?? createPrismaSpaceHealthRepository(app.db);
  }

  app.post('/', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const body = createSpaceBodySchema.parse(request.body);

    const { id } = await createSpace(repo(), user.userId, body.title);
    return toResponse(await getSpace(repo(), id, user.userId));
  });

  app.get('/invites/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    try {
      const result = await resolveSpaceInvite(repo(), token);
      return resolveSpaceInviteResponseSchema.parse(result);
    } catch (err) {
      if (err instanceof InviteNotFoundError) {
        return reply.code(404).send(apiError(request, 'INVITE_NOT_FOUND', 'این لینک دعوت معتبر نیست یا لغو شده است.'));
      }
      throw err;
    }
  });

  app.get('/:idOrSlug', async (request, reply) => {
    const { idOrSlug } = request.params as { idOrSlug: string };
    const user = getOptionalSession(request, opts.sessionHmacKey);

    try {
      return toResponse(await getSpace(repo(), idOrSlug, user?.userId ?? null));
    } catch (err) {
      if (err instanceof SpaceNotFoundError) {
        return reply.code(404).send(apiError(request, 'SPACE_NOT_FOUND', 'این بستر یافت نشد.'));
      }
      throw err;
    }
  });

  app.patch('/:spaceId', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const { spaceId } = request.params as { spaceId: string };
    const body = updateSpaceDefinitionBodySchema.parse(request.body);

    try {
      await updateSpaceDefinition(repo(), spaceId, user.userId, body);
      return toResponse(await getSpace(repo(), spaceId, user.userId));
    } catch (err) {
      if (err instanceof SpaceNotFoundError) {
        return reply.code(404).send(apiError(request, 'SPACE_NOT_FOUND', 'این بستر یافت نشد.'));
      }
      if (err instanceof NotSpaceEditorError) {
        return reply.code(403).send(apiError(request, 'FORBIDDEN', 'فقط سازنده یا مدیر این بستر می‌تواند آن را ویرایش کند.'));
      }
      if (err instanceof SpaceNotEditableError) {
        return reply.code(422).send(apiError(request, 'SPACE_NOT_EDITABLE', 'این بستر در وضعیت فعلی قابل ویرایش نیست.'));
      }
      if (err instanceof DuplicateRoleKeyError) {
        return reply.code(422).send(apiError(request, 'DUPLICATE_ROLE_KEY', 'شناسهٔ نقش نباید تکراری باشد.'));
      }
      throw err;
    }
  });

  app.post('/:spaceId/precheck', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const { spaceId } = request.params as { spaceId: string };

    try {
      const result = await precheckSpace(repo(), spaceId, user.userId);
      return precheckSpaceResponseSchema.parse(result);
    } catch (err) {
      if (err instanceof SpaceNotFoundError) {
        return reply.code(404).send(apiError(request, 'SPACE_NOT_FOUND', 'این بستر یافت نشد.'));
      }
      if (err instanceof NotSpaceEditorError) {
        return reply.code(403).send(apiError(request, 'FORBIDDEN', 'فقط سازنده یا مدیر این بستر می‌تواند این کار را انجام دهد.'));
      }
      if (err instanceof SpaceNotEditableError) {
        return reply.code(422).send(apiError(request, 'SPACE_NOT_EDITABLE', 'این بستر در وضعیت فعلی قابل بررسی نیست.'));
      }
      throw err;
    }
  });

  app.post('/:spaceId/publish', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const { spaceId } = request.params as { spaceId: string };

    try {
      const result = await publishSpace(repo(), spaceId, user.userId);
      return publishSpaceResponseSchema.parse({ status: result.status, publishedAt: result.publishedAt.toISOString() });
    } catch (err) {
      if (err instanceof SpaceNotFoundError) {
        return reply.code(404).send(apiError(request, 'SPACE_NOT_FOUND', 'این بستر یافت نشد.'));
      }
      if (err instanceof NotSpaceEditorError) {
        return reply.code(403).send(apiError(request, 'FORBIDDEN', 'فقط سازنده یا مدیر این بستر می‌تواند آن را منتشر کند.'));
      }
      if (err instanceof GateNotAllowedError) {
        return reply
          .code(422)
          .send(apiError(request, 'GATE_NOT_ALLOWED', 'این بستر باید ابتدا بررسی اولیه را با نتیجهٔ تأیید پشت سر بگذارد.'));
      }
      if (err instanceof SpaceNotEditableError) {
        return reply.code(422).send(apiError(request, 'SPACE_NOT_EDITABLE', 'این بستر در وضعیت فعلی قابل انتشار نیست.'));
      }
      throw err;
    }
  });

  app.post('/:spaceId/archive', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const { spaceId } = request.params as { spaceId: string };

    try {
      const result = await archiveSpace(repo(), spaceId, user.userId);
      return archiveSpaceResponseSchema.parse({ status: result.status, archivedAt: result.archivedAt.toISOString() });
    } catch (err) {
      if (err instanceof SpaceNotFoundError) {
        return reply.code(404).send(apiError(request, 'SPACE_NOT_FOUND', 'این بستر یافت نشد.'));
      }
      if (err instanceof NotSpaceEditorError) {
        return reply.code(403).send(apiError(request, 'FORBIDDEN', 'فقط سازنده یا مدیر این بستر می‌تواند آن را بایگانی کند.'));
      }
      if (err instanceof SpaceNotEditableError) {
        return reply.code(422).send(apiError(request, 'SPACE_NOT_EDITABLE', 'این بستر پیش‌تر بایگانی یا حذف شده است.'));
      }
      throw err;
    }
  });

  app.get('/:spaceId/health', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const { spaceId } = request.params as { spaceId: string };

    try {
      const snapshot = await getSpaceHealth(repo(), healthRepo(), spaceId, user.userId);
      return spaceHealthResponseSchema.parse({
        status: snapshot.status,
        cardCount: snapshot.cardCount,
        contributorCount: snapshot.contributorCount,
        meaningfulViewCount: snapshot.meaningfulViewCount,
        firstUseLatencySeconds: snapshot.firstUseLatencySeconds,
        roleActivity: snapshot.roleActivity,
        crossRoleCardRate: snapshot.crossRoleCardRate,
        appliedRate: snapshot.appliedRate,
        reservationClosedRate: snapshot.reservationClosedRate,
        reportQuality: snapshot.reportQuality,
        lastActivityAt: snapshot.lastActivityAt?.toISOString() ?? null,
        suggestions: snapshot.suggestions,
        computedAt: snapshot.computedAt.toISOString(),
      });
    } catch (err) {
      if (err instanceof SpaceNotFoundError) {
        return reply.code(404).send(apiError(request, 'SPACE_NOT_FOUND', 'این بستر یافت نشد.'));
      }
      if (err instanceof NotSpaceEditorError) {
        return reply.code(403).send(apiError(request, 'FORBIDDEN', 'فقط سازنده یا مدیر این بستر می‌تواند سلامت آن را ببیند.'));
      }
      throw err;
    }
  });

  app.post('/:spaceId/roles/:roleId/join', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const { spaceId, roleId } = request.params as { spaceId: string; roleId: string };

    try {
      await joinSpaceRole(repo(), spaceId, roleId, user.userId);
      return spaceRoleMembershipActionResponseSchema.parse({ ok: true });
    } catch (err) {
      if (err instanceof RoleNotFoundError) {
        return reply.code(404).send(apiError(request, 'ROLE_NOT_FOUND', 'این نقش در این بستر یافت نشد.'));
      }
      throw err;
    }
  });

  app.post('/:spaceId/roles/:roleId/leave', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const { spaceId, roleId } = request.params as { spaceId: string; roleId: string };

    try {
      await leaveSpaceRole(repo(), spaceId, roleId, user.userId);
      return spaceRoleMembershipActionResponseSchema.parse({ ok: true });
    } catch (err) {
      if (err instanceof RoleNotFoundError) {
        return reply.code(404).send(apiError(request, 'ROLE_NOT_FOUND', 'این نقش در این بستر یافت نشد.'));
      }
      throw err;
    }
  });

  app.post('/:spaceId/invites', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const { spaceId } = request.params as { spaceId: string };

    try {
      const result = await createSpaceInvite(repo(), spaceId, user.userId);
      return createSpaceInviteResponseSchema.parse(result);
    } catch (err) {
      if (err instanceof SpaceNotFoundError) {
        return reply.code(404).send(apiError(request, 'SPACE_NOT_FOUND', 'این بستر یافت نشد.'));
      }
      if (err instanceof NotSpaceEditorError) {
        return reply.code(403).send(apiError(request, 'FORBIDDEN', 'فقط سازنده یا مدیر این بستر می‌تواند لینک دعوت بسازد.'));
      }
      throw err;
    }
  });

  app.post('/:spaceId/invites/:token/revoke', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const { spaceId, token } = request.params as { spaceId: string; token: string };

    try {
      await revokeSpaceInvite(repo(), spaceId, token, user.userId);
      return spaceRoleMembershipActionResponseSchema.parse({ ok: true });
    } catch (err) {
      if (err instanceof SpaceNotFoundError) {
        return reply.code(404).send(apiError(request, 'SPACE_NOT_FOUND', 'این بستر یافت نشد.'));
      }
      if (err instanceof NotSpaceEditorError) {
        return reply.code(403).send(apiError(request, 'FORBIDDEN', 'فقط سازنده یا مدیر این بستر می‌تواند لینک دعوت را لغو کند.'));
      }
      throw err;
    }
  });
}
