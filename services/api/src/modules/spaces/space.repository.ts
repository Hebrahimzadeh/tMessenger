import type { Prisma, PrismaClient } from '@taavon/database';
import { logAwarenessEvent } from '../../lib/awareness-events';
import { normalizePersianLetters } from '../../lib/persian-text';
import type { MySpaceRecord, OpeningCardInput, SpaceRecord, SpaceRepository, SpaceRoleInputRecord } from './space.service';

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

/**
 * The three cards a space opens with, and the first comment under each.
 *
 * Real rows, in the same transaction as the space itself: a space either
 * exists as a conversation already started, or it does not exist. Their
 * author and their commenter are the creator - the one real person involved -
 * because "هویت جعلی" is the line this must not cross ("کارت آغازین ساختگی
 * یا هویت جعلی ممنوع است", §4.1's rule 32). What the 2026-09-27 decision
 * changes is only the *labelling*: these are the creator's own opening cards,
 * theirs to edit or delete, and not badged as samples.
 *
 * Everything an ordinary card writes is written here too - the revision, the
 * semantic profile, the card event, the outbox event and the awareness event -
 * because these are ordinary cards. An opening card that skipped half of that
 * would be a second kind of card nobody could reason about.
 *
 * `publishedAt` is set explicitly, a second apart and counting *down* the
 * list, rather than left to default. Postgres freezes `now()` for a whole
 * transaction, so three cards written here would otherwise share one instant
 * and the feed - which orders by `(publishedAt, id)` descending - would fall
 * back to comparing random uuids. That would shuffle the three on every
 * space. Counting down means the first card in the list is the newest, so a
 * visitor reads them in the order they were written: what this space is for,
 * then the two questions.
 */
async function createOpeningCards(
  tx: Prisma.TransactionClient,
  input: { spaceId: string; creatorId: string; cards: OpeningCardInput[] }
): Promise<void> {
  const firstPublishedAt = Date.now();

  for (const [index, opening] of input.cards.entries()) {
    const card = await tx.card.create({
      data: {
        spaceId: input.spaceId,
        authorId: input.creatorId,
        kind: opening.kind,
        status: 'ACTIVE',
        publishedAt: new Date(firstPublishedAt - index * 1000),
      },
      select: { id: true },
    });
    await tx.cardRevision.create({
      data: { cardId: card.id, revisionNumber: 1, body: opening.caption, editorId: input.creatorId },
    });
    await tx.cardSemanticProfile.create({
      data: { cardId: card.id, inferredKind: opening.inferredKind, confidence: opening.confidence },
    });
    await tx.cardEvent.create({
      data: {
        cardId: card.id,
        eventType: 'card.created',
        actorId: input.creatorId,
        payload: { kind: opening.kind, revisionNumber: 1, openingCard: index + 1 },
      },
    });
    await tx.outboxEvent.create({
      data: {
        aggregateType: 'Card',
        aggregateId: card.id,
        eventType: 'card.created',
        payload: { cardId: card.id, spaceId: input.spaceId, authorId: input.creatorId },
      },
    });
    await logAwarenessEvent(tx, {
      type: 'PRODUCED',
      actorId: input.creatorId,
      subjectId: card.id,
      deepLink: `/cards/${card.id}`,
      idempotencyKey: `card:${card.id}:PRODUCED`,
    });

    const comment = await tx.cardComment.create({
      data: { cardId: card.id, authorId: input.creatorId },
      select: { id: true },
    });
    await tx.cardCommentRevision.create({
      data: { commentId: comment.id, revisionNumber: 1, body: opening.comment, editorId: input.creatorId },
    });
    await tx.cardEvent.create({
      data: {
        cardId: card.id,
        eventType: 'card.comment_created',
        actorId: input.creatorId,
        payload: { commentId: comment.id, parentId: null },
      },
    });
    await tx.outboxEvent.create({
      data: {
        aggregateType: 'Card',
        aggregateId: card.id,
        eventType: 'card.comment_created',
        payload: { cardId: card.id, commentId: comment.id, authorId: input.creatorId },
      },
    });
    await logAwarenessEvent(tx, {
      type: 'PUBLIC_CONTRIBUTION',
      actorId: input.creatorId,
      subjectId: card.id,
      deepLink: `/cards/${card.id}`,
      idempotencyKey: `comment:${comment.id}:PUBLIC_CONTRIBUTION`,
    });
  }
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

    async createNewVersion({ spaceId, title, purpose, audience, participationMethods, roles, policyVersion, createdBy }) {
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
            primaryRoleIds,
            supplementaryRoleIds,
            policyVersion: input.policyVersion,
            createdBy: input.creatorId,
            gateVerdict: input.verdict,
            gateReason: input.reason,
          },
        });
        await createOpeningCards(tx, { spaceId: space.id, creatorId: input.creatorId, cards: input.openingCards });
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
