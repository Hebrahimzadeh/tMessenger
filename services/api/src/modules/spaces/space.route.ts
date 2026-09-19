import type { FastifyInstance } from 'fastify';
import {
  archiveSpaceResponseSchema,
  buildSpaceBodySchema,
  buildSpaceResponseSchema,
  createSpaceBodySchema,
  createSpaceInviteResponseSchema,
  mySpacesResponseSchema,
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
import { createSpaceCreationGate, type SpaceCreationGate } from './space-creation-gate';
import { createPrismaPolicyRuleSource } from '../ai/capabilities/policy.repository';
import { AiOrchestrator } from '../ai/orchestrator';
import { createPrismaOrchestratorRepository } from '../ai/ai.repository';
import {
  archiveSpace,
  buildSpaceFromPrompt,
  createSpace,
  createSpaceInvite,
  DuplicateRoleKeyError,
  editSpace,
  GateNotAllowedError,
  getSpace,
  InviteNotFoundError,
  joinSpaceRole,
  leaveSpaceRole,
  listMySpaces,
  NotSpaceEditorError,
  precheckSpace,
  publishSpace,
  resolveSpaceInvite,
  revokeSpaceInvite,
  RoleNotFoundError,
  SpaceBlockedError,
  SpaceEditRefusedError,
  SpaceNotEditableError,
  SpaceNotFoundError,
  type SpaceBuilder,
  type SpaceRepository,
} from './space.service';
import { buildSpace } from '../ai/capabilities/space-builder';

export interface SpaceRouteOptions {
  sessionHmacKey: string;
  spaceRepository?: SpaceRepository;
  spaceHealthRepository?: SpaceHealthRepository;
  /** Normally supplied by `buildApp`, which shares one orchestrator between this gate and `/ai/suggest`. */
  spaceCreationGate?: SpaceCreationGate;
  /** Normally supplied by `buildApp`, sharing the one orchestrator with every other AI-backed route. */
  spaceBuilder?: SpaceBuilder;
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
    followerCount: view.followerCount,
    isFollowing: view.isFollowing,
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
  // The fallback exists so this module can be registered on its own (a
  // route-level test, say) without the caller having to assemble an
  // orchestrator. It has no provider, which costs only the creative half:
  // the verdict is decided by the policy rules either way.
  function gate(): SpaceCreationGate {
    return (
      opts.spaceCreationGate ??
      createSpaceCreationGate(
        {
          orchestrator: new AiOrchestrator({
            provider: null,
            repository: createPrismaOrchestratorRepository(() => app.db),
            dailyBudgetMicros: null,
          }),
          policy: createPrismaPolicyRuleSource(() => app.db),
        },
        { onFailure: (error) => app.log.error({ err: error }, 'space creation gate failed closed') }
      )
    );
  }

  // Same reasoning as the gate's fallback: registrable on its own, with no
  // provider, which costs only the model's writing - the rule-built space is
  // complete and the policy baseline still decides.
  function builder(): SpaceBuilder {
    if (opts.spaceBuilder) return opts.spaceBuilder;
    const orchestrator = new AiOrchestrator({
      provider: null,
      repository: createPrismaOrchestratorRepository(() => app.db),
      dailyBudgetMicros: null,
    });
    const policy = createPrismaPolicyRuleSource(() => app.db);
    return { build: (prompt, requesterId) => buildSpace({ orchestrator, policy }, prompt, requesterId) };
  }

  /**
   * One prompt, a whole space - the way spaces are made.
   *
   * 200 for every decision, BLOCKED included: a refusal here is an answer the
   * person needs to read (which rule, what to rewrite), not a malformed
   * request, and the body carries everything the page needs either way.
   */
  app.post('/build', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const body = buildSpaceBodySchema.parse(request.body);

    const result = await buildSpaceFromPrompt(repo(), builder(), user.userId, body.prompt);
    return buildSpaceResponseSchema.parse(result);
  });

  app.post('/', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const body = createSpaceBodySchema.parse(request.body);

    try {
      const { id } = await createSpace(repo(), gate(), user.userId, body.title);
      return toResponse(await getSpace(repo(), id, user.userId));
    } catch (err) {
      if (err instanceof SpaceBlockedError) {
        // 422 and no Location: nothing was created, so there is nothing to
        // point at. The message says what to do, not what they are.
        return reply
          .code(422)
          .send(apiError(request, 'SPACE_BLOCKED', 'این عنوان با یکی از قواعد صریح پلتفرم مغایرت دارد. عنوان دیگری بنویسید.'));
      }
      throw err;
    }
  });

  /**
   * The caller's own spaces - the list a person opens the app to.
   *
   * Registered before `/:idOrSlug` deliberately: Fastify would otherwise
   * read `mine` as a slug and answer 404 for a space nobody named.
   */
  app.get('/mine', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;

    const items = await listMySpaces(repo(), user.userId);
    return mySpacesResponseSchema.parse({
      items: items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
    });
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
      await editSpace(repo(), gate(), spaceId, user.userId, body);
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
      if (err instanceof SpaceEditRefusedError) {
        // The published version is untouched; the message says why and the
        // details cite any rule that matched.
        return reply.code(422).send(apiError(request, 'SPACE_EDIT_REFUSED', err.reason, err.matchedPolicyRules));
      }
      throw err;
    }
  });

  app.post('/:spaceId/precheck', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const { spaceId } = request.params as { spaceId: string };

    try {
      const result = await precheckSpace(repo(), gate(), spaceId, user.userId);
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
