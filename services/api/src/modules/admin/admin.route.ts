import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  assignRoleBodySchema,
  assignRoleResponseSchema,
  awarenessMetricsResponseSchema,
  identityClaimDetailResponseSchema,
  identityClaimListResponseSchema,
  reviewIdentityClaimBodySchema,
} from '@taavon/contracts';
import type { Prisma, PrismaClient } from '@taavon/database';
import {
  createPrismaAwarenessAggregationRepository,
  type AwarenessAggregationRepository,
} from '@taavon/awareness';
import { apiError } from '../../lib/api-error';
import { requireRole } from '../../plugins/authorize';
import { createPrismaRoleAssignmentRepository, type RoleAssignmentRepository } from '../auth/role-assignment.repository';
import { createPrismaIdentityClaimRepository } from '../identity-claim/identity-claim.repository';
import {
  ClaimNotFoundError,
  getClaimForReview,
  listPendingClaims,
  reviewIdentityClaim,
  type IdentityClaimRepository,
} from '../identity-claim/identity-claim.service';
import { assignRole, IdentityClaimNotVerifiedError, UnknownRoleError } from './role-assignment.service';

export interface AdminAuditEvent {
  action: string;
  actorId: string;
  targetType: string;
  targetId: string;
  reason?: string | null;
  metadata?: Prisma.InputJsonValue;
}

async function defaultAudit(prisma: PrismaClient, event: AdminAuditEvent): Promise<void> {
  await prisma.auditEvent.create({
    data: {
      actorId: event.actorId,
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId,
      reason: event.reason ?? null,
      correlationId: randomUUID(),
      metadata: event.metadata ?? {},
    },
  });
}

export interface AdminRouteOptions {
  sessionHmacKey: string;
  phoneEncryptionKey: string;
  /** Test seams. */
  roleAssignmentRepository?: RoleAssignmentRepository;
  identityClaimRepository?: IdentityClaimRepository;
  awarenessAggregationRepository?: AwarenessAggregationRepository;
  audit?: (prisma: PrismaClient, event: AdminAuditEvent) => Promise<void>;
}

const AWARENESS_METRICS_DAYS = 30;

export async function adminRoutes(app: FastifyInstance, opts: AdminRouteOptions) {
  // Resolved per-request, not at plugin-registration time - same reason as
  // legal-document.route.ts's Task 05 fix: app.db isn't decorated yet when
  // this plugin registers.
  function roleRepo(): RoleAssignmentRepository {
    return opts.roleAssignmentRepository ?? createPrismaRoleAssignmentRepository(app.db);
  }
  function claimRepo(): IdentityClaimRepository {
    return opts.identityClaimRepository ?? createPrismaIdentityClaimRepository(app.db);
  }
  function awarenessAggregationRepo(): AwarenessAggregationRepository {
    return opts.awarenessAggregationRepository ?? createPrismaAwarenessAggregationRepository(app.db);
  }
  const audit = opts.audit ?? defaultAudit;
  const authorizeDeps = () => ({ sessionHmacKey: opts.sessionHmacKey, roleRepo: roleRepo() });

  // Every route below is SUPERADMIN + MFA only (Task 09 interface:
  // "POST /v1/admin/role-assignments فقط SUPERADMIN دارای MFA") -
  // requireRole() itself both checks the role server-side (never trusting
  // anything from the request) and enforces the second-factor challenge.

  app.get('/identity-claims', async (request, reply) => {
    const authorized = await requireRole('SUPERADMIN')(request, reply, authorizeDeps());
    if (!authorized) return;

    const claims = await listPendingClaims(claimRepo());
    return identityClaimListResponseSchema.parse({ claims });
  });

  app.get<{ Params: { userId: string } }>('/identity-claims/:userId', async (request, reply) => {
    const authorized = await requireRole('SUPERADMIN')(request, reply, authorizeDeps());
    if (!authorized) return;

    try {
      const result = await getClaimForReview(claimRepo(), opts.phoneEncryptionKey, request.params.userId);
      return identityClaimDetailResponseSchema.parse(result);
    } catch (err) {
      if (err instanceof ClaimNotFoundError) {
        return reply.code(404).send(apiError(request, 'CLAIM_NOT_FOUND', 'مدرکی برای این کاربر ثبت نشده است.'));
      }
      throw err;
    }
  });

  app.post<{ Params: { userId: string } }>('/identity-claims/:userId/verify', async (request, reply) => {
    const authorized = await requireRole('SUPERADMIN')(request, reply, authorizeDeps());
    if (!authorized) return;

    const body = reviewIdentityClaimBodySchema.parse(request.body);
    const targetUserId = request.params.userId;

    try {
      await reviewIdentityClaim(claimRepo(), targetUserId, body.decision, authorized.userId);
      await audit(app.db, {
        action: 'admin.identity_claim_reviewed',
        actorId: authorized.userId,
        targetType: 'User',
        targetId: targetUserId,
        reason: body.reason ?? null,
        metadata: { decision: body.decision },
      });
      return { ok: true };
    } catch (err) {
      if (err instanceof ClaimNotFoundError) {
        return reply.code(404).send(apiError(request, 'CLAIM_NOT_FOUND', 'مدرکی برای این کاربر ثبت نشده است.'));
      }
      throw err;
    }
  });

  app.post('/role-assignments', async (request, reply) => {
    const authorized = await requireRole('SUPERADMIN')(request, reply, authorizeDeps());
    if (!authorized) return;

    const body = assignRoleBodySchema.parse(request.body);

    try {
      const result = await assignRole({ roleRepo: roleRepo(), claimRepo: claimRepo() }, body.userId, body.role, authorized.userId);
      await audit(app.db, {
        action: 'admin.role_assigned',
        actorId: authorized.userId,
        targetType: 'User',
        targetId: body.userId,
        metadata: { role: body.role, created: result.created },
      });
      return assignRoleResponseSchema.parse(result);
    } catch (err) {
      if (err instanceof UnknownRoleError) {
        return reply.code(422).send(apiError(request, 'UNKNOWN_ROLE', 'نقش نامعتبر است.'));
      }
      if (err instanceof IdentityClaimNotVerifiedError) {
        return reply
          .code(422)
          .send(apiError(request, 'IDENTITY_CLAIM_NOT_VERIFIED', 'برای این نقش، تأیید مدرک هویت رسمی لازم است.'));
      }
      throw err;
    }
  });

  // "dashboard فقط آمار تجمیعی و بدون score انسان نمایش دهد" - this route
  // only ever reads the pre-computed daily aggregates (see @taavon/awareness);
  // it never queries AwarenessEvent directly, so there is no raw actor/
  // subject id or per-human score anywhere in this response even in
  // principle, not merely by omission.
  app.get('/metrics/awareness', async (request, reply) => {
    const authorized = await requireRole('SUPERADMIN')(request, reply, authorizeDeps());
    if (!authorized) return;

    const days = await awarenessAggregationRepo().listRecentAggregates(AWARENESS_METRICS_DAYS);
    return awarenessMetricsResponseSchema.parse({
      days: days.map((day) => ({
        date: day.date.toISOString().slice(0, 10),
        producedCount: day.producedCount,
        meaningfulViewCount: day.meaningfulViewCount,
        publicContributionCount: day.publicContributionCount,
        appliedCount: day.appliedCount,
        privateChatStartedCount: day.privateChatStartedCount,
        reservationClosedCount: day.reservationClosedCount,
      })),
    });
  });
}
