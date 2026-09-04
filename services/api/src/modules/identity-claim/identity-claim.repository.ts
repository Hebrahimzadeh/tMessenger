import type { PrismaClient } from '@taavon/database';
import type { IdentityClaimRepository } from './identity-claim.service';

export function createPrismaIdentityClaimRepository(prisma: PrismaClient): IdentityClaimRepository {
  return {
    async findByUserId(userId) {
      return prisma.officialIdentityClaim.findUnique({ where: { userId }, select: { status: true } });
    },

    async findWithEvidenceByUserId(userId) {
      return prisma.officialIdentityClaim.findUnique({
        where: { userId },
        select: { status: true, evidenceCiphertext: true },
      });
    },

    async upsertPending(userId, evidenceCiphertext) {
      await prisma.officialIdentityClaim.upsert({
        where: { userId },
        create: { userId, status: 'PENDING', evidenceCiphertext },
        update: { status: 'PENDING', evidenceCiphertext, reviewedBy: null, reviewedAt: null },
      });
    },

    async review(userId, status, reviewedBy) {
      await prisma.officialIdentityClaim.update({
        where: { userId },
        data: { status, reviewedBy, reviewedAt: new Date() },
      });
    },

    async findPending() {
      return prisma.officialIdentityClaim.findMany({
        where: { status: 'PENDING' },
        select: { userId: true, status: true },
        orderBy: { createdAt: 'asc' },
      });
    },
  };
}
