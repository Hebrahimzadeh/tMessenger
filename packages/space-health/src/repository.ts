import { Prisma, type PrismaClient, type SpaceHealthStatus } from '@taavon/database';
import type { HealthSignals, HealthSuggestion } from './health';

/** The stored snapshot's own shape - mirrors services/api's `spaceHealthResponseSchema` field-for-field, deliberately with no combined score anywhere. */
export interface SpaceHealthSnapshotRecord {
  status: SpaceHealthStatus;
  cardCount: number;
  contributorCount: number;
  meaningfulViewCount: number;
  firstUseLatencySeconds: number | null;
  roleActivity: { totalRoleCount: number; activeRoleCount: number };
  crossRoleCardRate: number;
  appliedRate: number;
  reservationClosedRate: number;
  reportQuality: number | null;
  lastActivityAt: Date | null;
  suggestions: HealthSuggestion[];
  computedAt: Date;
}

export interface SpaceHealthRepository {
  gatherSignals(spaceId: string): Promise<HealthSignals>;
  upsertSnapshot(spaceId: string, status: SpaceHealthStatus, signals: HealthSignals, suggestions: HealthSuggestion[]): Promise<void>;
  getSnapshot(spaceId: string): Promise<SpaceHealthSnapshotRecord | null>;
  /** Every currently-PUBLISHED space's id - the daily worker job's own iteration list (see services/worker/src/jobs/space-health.ts, via runSpaceHealthJob in job.ts). */
  listPublishedSpaceIds(): Promise<string[]>;
}

export function createPrismaSpaceHealthRepository(prisma: PrismaClient): SpaceHealthRepository {
  return {
    async gatherSignals(spaceId) {
      const space = await prisma.space.findUniqueOrThrow({ where: { id: spaceId }, select: { publishedAt: true } });

      const [memberships, roles, activeRoles, latestVersion, cardCount, latestCard] = await Promise.all([
        prisma.spaceRoleMembership.findMany({ where: { spaceId }, distinct: ['userId'], select: { userId: true, createdAt: true } }),
        prisma.spaceParticipationRole.count({ where: { spaceId } }),
        prisma.spaceParticipationRole.count({ where: { spaceId, memberships: { some: {} } } }),
        prisma.spaceDefinitionVersion.findFirst({ where: { spaceId }, orderBy: { versionNumber: 'desc' }, select: { createdAt: true } }),
        // "کارت‌های نمونه ... هیچ counter را افزایش نمی‌دهند" - only real
        // ACTIVE cards count; cardHints on the definition version is opaque
        // descriptive JSON and is never queried here. Task 14 added the Card
        // model, so this signal (stubbed at 0 in Task 13) is now real.
        prisma.card.count({ where: { spaceId, status: 'ACTIVE' } }),
        prisma.card.findFirst({ where: { spaceId, status: 'ACTIVE' }, orderBy: { publishedAt: 'desc' }, select: { publishedAt: true } }),
      ]);

      // "reaction و ترافیک bot هیچ counter را افزایش نمی‌دهند" - nothing
      // below reads a reaction or view table because none exist yet
      // (Task 15/analytics). Real contributor/role signals come exclusively
      // from SpaceRoleMembership - a genuine role join, the only kind of
      // participation this codebase can verify happened.

      const activityTimestamps = [
        space.publishedAt,
        latestVersion?.createdAt ?? null,
        latestCard?.publishedAt ?? null,
        ...memberships.map((m) => m.createdAt),
      ].filter((d): d is Date => d !== null);
      const lastActivityAt = activityTimestamps.length > 0 ? new Date(Math.max(...activityTimestamps.map((d) => d.getTime()))) : null;

      return {
        publishedAt: space.publishedAt!,
        lastActivityAt,
        contributorCount: memberships.length,
        totalRoleCount: roles,
        activeRoleCount: activeRoles,
        cardCount,
      };
    },

    async upsertSnapshot(spaceId, status, signals, suggestions) {
      await prisma.spaceHealthSnapshot.upsert({
        where: { spaceId },
        create: {
          spaceId,
          status,
          cardCount: signals.cardCount,
          contributorCount: signals.contributorCount,
          meaningfulViewCount: 0,
          firstUseLatencySeconds: null,
          roleActivity: { totalRoleCount: signals.totalRoleCount, activeRoleCount: signals.activeRoleCount },
          crossRoleCardRate: 0,
          appliedRate: 0,
          reservationClosedRate: 0,
          reportQuality: null,
          lastActivityAt: signals.lastActivityAt,
          suggestions: suggestions as unknown as Prisma.InputJsonValue,
        },
        update: {
          status,
          cardCount: signals.cardCount,
          contributorCount: signals.contributorCount,
          roleActivity: { totalRoleCount: signals.totalRoleCount, activeRoleCount: signals.activeRoleCount },
          lastActivityAt: signals.lastActivityAt,
          suggestions: suggestions as unknown as Prisma.InputJsonValue,
          computedAt: new Date(),
        },
      });
    },

    async getSnapshot(spaceId) {
      const row = await prisma.spaceHealthSnapshot.findUnique({ where: { spaceId } });
      if (!row) return null;

      return {
        status: row.status,
        cardCount: row.cardCount,
        contributorCount: row.contributorCount,
        meaningfulViewCount: row.meaningfulViewCount,
        firstUseLatencySeconds: row.firstUseLatencySeconds,
        roleActivity: row.roleActivity as { totalRoleCount: number; activeRoleCount: number },
        crossRoleCardRate: row.crossRoleCardRate,
        appliedRate: row.appliedRate,
        reservationClosedRate: row.reservationClosedRate,
        reportQuality: row.reportQuality,
        lastActivityAt: row.lastActivityAt,
        suggestions: row.suggestions as unknown as HealthSuggestion[],
        computedAt: row.computedAt,
      };
    },

    async listPublishedSpaceIds() {
      const spaces = await prisma.space.findMany({ where: { status: 'PUBLISHED' }, select: { id: true } });
      return spaces.map((s) => s.id);
    },
  };
}
