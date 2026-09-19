import type { Prisma, PrismaClient } from '@taavon/database';
import type { SpaceCardHint } from '@taavon/contracts';
import { logAwarenessEvent } from '../../lib/awareness-events';
import { normalizePersianLetters } from '../../lib/persian-text';
import type { MySpaceRecord, SpaceRecord, SpaceRepository, SpaceRoleInputRecord } from './space.service';

/** Denormalized search column - see schema.prisma's Space.searchText comment. Same normalization as slug.ts/space-similarity.service.ts, so a query normalized the same way actually matches. */
function buildSearchText(title: string, purpose: string, audience: string | undefined): string {
  return normalizePersianLetters(`${title} ${purpose} ${audience ?? ''}`.trim().toLowerCase());
}

const LATEST_VERSION_INCLUDE = {
  definitionVersions: { orderBy: { versionNumber: 'desc' as const }, take: 1 },
  participationRoles: true,
};

type SpaceWithLatestVersion = NonNullable<Awaited<ReturnType<ReturnType<typeof buildFinder>>>>;

function buildFinder(prisma: PrismaClient) {
  return (where: { id: string } | { slug: string }) => prisma.space.findUnique({ where, include: LATEST_VERSION_INCLUDE });
}

function toRecord(space: SpaceWithLatestVersion): SpaceRecord {
  const version = space.definitionVersions[0]!;
  return {
    id: space.id,
    slug: space.slug,
    status: space.status,
    creatorId: space.creatorId,
    publishedAt: space.publishedAt,
    archivedAt: space.archivedAt,
    latestVersion: {
      versionNumber: version.versionNumber,
      title: version.title,
      purpose: version.purpose,
      audience: version.audience,
      participationMethods: version.participationMethods as string[],
      cardHints: version.cardHints as SpaceCardHint[] | null,
      policyVersion: version.policyVersion,
      gateVerdict: version.gateVerdict,
      gateReason: version.gateReason,
      primaryRoleIds: version.primaryRoleIds as string[],
      supplementaryRoleIds: version.supplementaryRoleIds as string[],
    },
    roles: space.participationRoles.map((role) => ({
      id: role.id,
      key: role.key,
      title: role.title,
      description: role.description,
      isPrimary: role.isPrimary,
    })),
  };
}

/** Upserts each input role by (spaceId, key) inside an already-open transaction, returning the resulting id split into primary/supplementary, in the same order as `roles`. */
async function upsertRoles(
  tx: Prisma.TransactionClient,
  spaceId: string,
  roles: SpaceRoleInputRecord[]
): Promise<{ primaryRoleIds: string[]; supplementaryRoleIds: string[] }> {
  const primaryRoleIds: string[] = [];
  const supplementaryRoleIds: string[] = [];

  for (const role of roles) {
    const upserted = await tx.spaceParticipationRole.upsert({
      where: { spaceId_key: { spaceId, key: role.key } },
      create: { spaceId, key: role.key, title: role.title, description: role.description, isPrimary: role.isPrimary },
      update: { title: role.title, description: role.description, isPrimary: role.isPrimary },
      select: { id: true },
    });
    (role.isPrimary ? primaryRoleIds : supplementaryRoleIds).push(upserted.id);
  }

  return { primaryRoleIds, supplementaryRoleIds };
}

export function createPrismaSpaceRepository(prisma: PrismaClient): SpaceRepository {
  const findSpace = buildFinder(prisma);

  return {
    async slugExists(slug) {
      const found = await prisma.space.findUnique({ where: { slug }, select: { id: true } });
      return found !== null;
    },

    async followState(spaceId, userId) {
      const [followerCount, own] = await Promise.all([
        prisma.spaceFollower.count({ where: { spaceId } }),
        userId ? prisma.spaceFollower.findUnique({ where: { spaceId_userId: { spaceId, userId } }, select: { id: true } }) : null,
      ]);
      return { followerCount, isFollowing: own !== null };
    },

    async listByCreator(creatorId, limit) {
      const spaces = await prisma.space.findMany({
        where: { creatorId, status: { notIn: ['ARCHIVED', 'REMOVED'] } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          slug: true,
          status: true,
          createdAt: true,
          definitionVersions: { orderBy: { versionNumber: 'desc' }, take: 1, select: { title: true, purpose: true } },
        },
      });

      return spaces.map(
        (space): MySpaceRecord => ({
          id: space.id,
          slug: space.slug,
          // Every space has a version 1 created in the same transaction as
          // the space itself, so this is never actually empty; the fallback
          // is here so a list never throws over one odd row.
          title: space.definitionVersions[0]?.title ?? space.slug,
          purpose: space.definitionVersions[0]?.purpose ?? '',
          status: space.status,
          createdAt: space.createdAt,
        })
      );
    },

    async createDraft({ title, slug, policyVersion, creatorId }) {
      return prisma.$transaction(async (tx) => {
        const space = await tx.space.create({ data: { slug, creatorId, status: 'DRAFT', searchText: buildSearchText(title, '', undefined) } });
        await tx.spaceDefinitionVersion.create({
          data: {
            spaceId: space.id,
            versionNumber: 1,
            title,
            purpose: '',
            participationMethods: [],
            primaryRoleIds: [],
            supplementaryRoleIds: [],
            policyVersion,
            createdBy: creatorId,
          },
        });
        await tx.outboxEvent.create({
          data: {
            aggregateType: 'Space',
            aggregateId: space.id,
            eventType: 'space.created',
            payload: { spaceId: space.id, slug: space.slug, creatorId },
          },
        });
        return { id: space.id };
      });
    },

    async findById(id) {
      const space = await findSpace({ id });
      return space ? toRecord(space) : null;
    },

    async findBySlug(slug) {
      const space = await findSpace({ slug });
      return space ? toRecord(space) : null;
    },

    async hasSpaceAdminRole(userId, spaceId) {
      const assignment = await prisma.roleAssignment.findFirst({
        where: { userId, scopeType: 'SPACE', scopeId: spaceId, role: { key: 'SPACE_ADMIN' } },
        select: { id: true },
      });
      return assignment !== null;
    },

    async createNewVersion({ spaceId, title, purpose, audience, participationMethods, cardHints, roles, policyVersion, createdBy }) {
      return prisma.$transaction(async (tx) => {
        const { primaryRoleIds, supplementaryRoleIds } = await upsertRoles(tx, spaceId, roles);

        const latest = await tx.spaceDefinitionVersion.findFirst({
          where: { spaceId },
          orderBy: { versionNumber: 'desc' },
          select: { versionNumber: true },
        });
        const versionNumber = (latest?.versionNumber ?? 0) + 1;

        await tx.spaceDefinitionVersion.create({
          data: {
            spaceId,
            versionNumber,
            title,
            purpose,
            audience,
            participationMethods,
            cardHints: cardHints ?? undefined,
            primaryRoleIds,
            supplementaryRoleIds,
            policyVersion,
            createdBy,
          },
        });
        await tx.space.update({ where: { id: spaceId }, data: { status: 'DRAFT', searchText: buildSearchText(title, purpose, audience) } });
        await tx.outboxEvent.create({
          data: {
            aggregateType: 'Space',
            aggregateId: spaceId,
            eventType: 'space.versioned',
            payload: { spaceId, versionNumber },
          },
        });

        return { versionNumber };
      });
    },

    async createBuiltSpace(input) {
      return prisma.$transaction(async (tx) => {
        const publishedAt = input.status === 'PUBLISHED' ? new Date() : null;
        const space = await tx.space.create({
          data: {
            slug: input.slug,
            creatorId: input.creatorId,
            status: input.status,
            publishedAt,
            searchText: buildSearchText(input.title, input.purpose, input.audience),
          },
        });
        const { primaryRoleIds, supplementaryRoleIds } = await upsertRoles(tx, space.id, input.roles);
        await tx.spaceDefinitionVersion.create({
          data: {
            spaceId: space.id,
            versionNumber: 1,
            title: input.title,
            purpose: input.purpose,
            audience: input.audience,
            participationMethods: input.participationMethods,
            cardHints: input.cardHints,
            primaryRoleIds,
            supplementaryRoleIds,
            policyVersion: input.policyVersion,
            createdBy: input.creatorId,
            gateVerdict: input.verdict,
            gateReason: input.reason,
          },
        });
        await tx.outboxEvent.create({
          data: {
            aggregateType: 'Space',
            aggregateId: space.id,
            eventType: 'space.created',
            payload: { spaceId: space.id, slug: space.slug, creatorId: input.creatorId },
          },
        });
        if (publishedAt) {
          await tx.outboxEvent.create({
            data: { aggregateType: 'Space', aggregateId: space.id, eventType: 'space.published', payload: { spaceId: space.id } },
          });
        }
        // Which document and which baseline produced this space, and whether a
        // model wrote it - so a space is explainable after either changes.
        await tx.auditEvent.create({
          data: {
            actorId: input.creatorId,
            action: 'space.built',
            targetType: 'Space',
            targetId: space.id,
            reason: input.reason,
            correlationId: `space-build:${space.id}`,
            metadata: {
              verdict: input.verdict,
              policyVersionRef: input.policyVersionRef,
              matchedPolicyRules: input.matchedPolicyRules,
              documentRef: input.documentRef,
              creativityApplied: input.creativityApplied,
            },
          },
        });
        return { id: space.id };
      });
    },

    async publishNewVersion(input) {
      return prisma.$transaction(async (tx) => {
        const { primaryRoleIds, supplementaryRoleIds } = await upsertRoles(tx, input.spaceId, input.roles);
        const latest = await tx.spaceDefinitionVersion.findFirst({
          where: { spaceId: input.spaceId },
          orderBy: { versionNumber: 'desc' },
          select: { versionNumber: true },
        });
        const versionNumber = (latest?.versionNumber ?? 0) + 1;

        await tx.spaceDefinitionVersion.create({
          data: {
            spaceId: input.spaceId,
            versionNumber,
            title: input.title,
            purpose: input.purpose,
            audience: input.audience,
            participationMethods: input.participationMethods,
            cardHints: input.cardHints ?? undefined,
            primaryRoleIds,
            supplementaryRoleIds,
            policyVersion: input.policyVersion,
            createdBy: input.createdBy,
            gateVerdict: 'ALLOW',
            gateReason: input.gateReason,
          },
        });
        // Status deliberately untouched: it stays PUBLISHED.
        await tx.space.update({
          where: { id: input.spaceId },
          data: { searchText: buildSearchText(input.title, input.purpose, input.audience) },
        });
        await tx.outboxEvent.create({
          data: {
            aggregateType: 'Space',
            aggregateId: input.spaceId,
            eventType: 'space.versioned',
            payload: { spaceId: input.spaceId, versionNumber },
          },
        });
        await tx.auditEvent.create({
          data: {
            actorId: input.createdBy,
            action: 'space.edited',
            targetType: 'Space',
            targetId: input.spaceId,
            reason: input.gateReason,
            correlationId: `space-edit:${input.spaceId}:${versionNumber}`,
            metadata: {
              versionNumber,
              policyVersionRef: input.policyVersionRef,
              matchedPolicyRules: input.matchedPolicyRules,
            },
          },
        });
        return { versionNumber };
      });
    },

    async setGateVerdict(input) {
      const { spaceId, versionNumber, verdict, reason, newStatus, actorId, policyVersionRef, matchedPolicyRules } = input;
      await prisma.$transaction(async (tx) => {
        await tx.spaceDefinitionVersion.update({
          where: { spaceId_versionNumber: { spaceId, versionNumber } },
          data: { gateVerdict: verdict, gateReason: reason },
        });
        await tx.space.update({ where: { id: spaceId }, data: { status: newStatus } });
        // In the same transaction as the verdict it describes, so the trail
        // can never disagree with the record - "منبع policyVersion در نتیجه
        // و audit ثبت شود".
        await tx.auditEvent.create({
          data: {
            actorId,
            action: 'space.gate_verdict',
            targetType: 'Space',
            targetId: spaceId,
            reason,
            correlationId: `space-gate:${spaceId}:${versionNumber}`,
            metadata: { verdict, versionNumber, policyVersionRef, matchedPolicyRules },
          },
        });
      });
    },

    async publish(spaceId) {
      return prisma.$transaction(async (tx) => {
        const publishedAt = new Date();
        await tx.space.update({ where: { id: spaceId }, data: { status: 'PUBLISHED', publishedAt } });
        await tx.outboxEvent.create({
          data: { aggregateType: 'Space', aggregateId: spaceId, eventType: 'space.published', payload: { spaceId } },
        });
        return { publishedAt };
      });
    },

    async archive(spaceId) {
      const archivedAt = new Date();
      await prisma.space.update({ where: { id: spaceId }, data: { status: 'ARCHIVED', archivedAt } });
      return { archivedAt };
    },

    async findRoleInSpace(spaceId, roleId) {
      const role = await prisma.spaceParticipationRole.findFirst({ where: { id: roleId, spaceId }, select: { id: true } });
      return role;
    },

    async joinRole(spaceId, userId, roleId) {
      await prisma.$transaction(async (tx) => {
        await tx.spaceRoleMembership.upsert({
          where: { userId_roleId: { userId, roleId } },
          create: { spaceId, userId, roleId },
          update: {},
        });
        // "applied" - joining a participation role is this codebase's own
        // form of applying to help. Idempotency-keyed per (space, user,
        // role) so re-joining the same role after a leave/rejoin cycle
        // logs the milestone only once, matching the upsert's own
        // create-or-no-op semantics above.
        await logAwarenessEvent(tx, {
          type: 'APPLIED',
          actorId: userId,
          subjectId: spaceId,
          deepLink: `/spaces/${spaceId}`,
          idempotencyKey: `role-membership:${spaceId}:${userId}:${roleId}:APPLIED`,
        });
      });
    },

    async leaveRole(userId, roleId) {
      await prisma.spaceRoleMembership.deleteMany({ where: { userId, roleId } });
    },

    async createInvite(spaceId, createdBy, token) {
      await prisma.spaceInvite.create({ data: { spaceId, createdBy, token } });
    },

    async revokeInvite(spaceId, token) {
      const result = await prisma.spaceInvite.updateMany({
        where: { spaceId, token, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return result.count > 0;
    },

    async resolveInvite(token) {
      const invite = await prisma.spaceInvite.findFirst({
        where: { token, revokedAt: null },
        select: { space: { select: { id: true, slug: true } } },
      });
      return invite ? { spaceId: invite.space.id, slug: invite.space.slug } : null;
    },
  };
}
