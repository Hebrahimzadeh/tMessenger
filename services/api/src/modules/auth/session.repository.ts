import type { PrismaClient } from '@taavon/database';

export interface SessionRecord {
  id: string;
  userId: string;
  tokenFamilyId: string;
  refreshHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  deviceId: string | null;
}

export interface NewSession {
  userId: string;
  tokenFamilyId: string;
  refreshHash: string;
  expiresAt: Date;
  deviceId?: string | null;
}

export interface SessionRepository {
  create(input: NewSession): Promise<SessionRecord>;
  findByRefreshHash(refreshHash: string): Promise<SessionRecord | null>;
  /** No-op if already revoked - preserves the original revocation timestamp rather than overwriting it. */
  revoke(sessionId: string): Promise<void>;
  /** Revokes every not-yet-revoked session sharing tokenFamilyId - the reuse-detection response (Task 06 acceptance: "reuse sessionها revoke کند"). */
  revokeFamily(tokenFamilyId: string): Promise<void>;
}

export function createPrismaSessionRepository(prisma: PrismaClient): SessionRepository {
  return {
    async create(input) {
      return prisma.session.create({ data: { ...input, deviceId: input.deviceId ?? null } });
    },

    async findByRefreshHash(refreshHash) {
      return prisma.session.findUnique({ where: { refreshHash } });
    },

    async revoke(sessionId) {
      await prisma.session.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    },

    async revokeFamily(tokenFamilyId) {
      await prisma.session.updateMany({
        where: { tokenFamilyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    },
  };
}
