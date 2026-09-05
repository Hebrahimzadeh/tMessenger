import type { Prisma, PrismaClient } from '@taavon/database';
import type { SpaceCardHint } from '@taavon/contracts';
import { normalizePersianLetters } from '../../lib/persian-text';
import type { SpaceRecord, SpaceRepository, SpaceRoleInputRecord } from './space.service';

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

    async setGateVerdict(spaceId, versionNumber, verdict, reason, newStatus) {
      await prisma.$transaction([
        prisma.spaceDefinitionVersion.update({
          where: { spaceId_versionNumber: { spaceId, versionNumber } },
          data: { gateVerdict: verdict, gateReason: reason },
        }),
        prisma.space.update({ where: { id: spaceId }, data: { status: newStatus } }),
      ]);
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
      await prisma.spaceRoleMembership.upsert({
        where: { userId_roleId: { userId, roleId } },
        create: { spaceId, userId, roleId },
        update: {},
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
