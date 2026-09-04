import type { PrismaClient } from '@taavon/database';
import type { MfaEnrollmentRecord, MfaRepository } from './mfa.service';

export function createPrismaMfaRepository(prisma: PrismaClient): MfaRepository {
  return {
    async findEnrollment(userId): Promise<MfaEnrollmentRecord | null> {
      return prisma.mfaEnrollment.findUnique({
        where: { userId },
        select: { status: true, secretCiphertext: true },
      });
    },

    async upsertPendingEnrollment(userId, secretCiphertext) {
      await prisma.$transaction(async (tx) => {
        const existing = await tx.mfaEnrollment.findUnique({ where: { userId }, select: { id: true } });

        if (existing) {
          // Re-enrolling discards any recovery codes tied to the old
          // secret first - otherwise they'd stay "valid" hashes sitting
          // next to a secret they were never issued for.
          await tx.mfaRecoveryCode.deleteMany({ where: { enrollmentId: existing.id } });
          await tx.mfaEnrollment.update({
            where: { userId },
            data: { secretCiphertext, status: 'PENDING', confirmedAt: null },
          });
        } else {
          await tx.mfaEnrollment.create({ data: { userId, secretCiphertext, status: 'PENDING' } });
        }
      });
    },

    async activateEnrollment(userId, recoveryCodeHashes) {
      await prisma.$transaction(async (tx) => {
        const enrollment = await tx.mfaEnrollment.update({
          where: { userId },
          data: { status: 'ACTIVE', confirmedAt: new Date() },
          select: { id: true },
        });
        await tx.mfaRecoveryCode.createMany({
          data: recoveryCodeHashes.map((codeHash) => ({ enrollmentId: enrollment.id, codeHash })),
        });
      });
    },

    async findUnusedRecoveryCodeByHash(userId, codeHash) {
      const enrollment = await prisma.mfaEnrollment.findUnique({ where: { userId }, select: { id: true } });
      if (!enrollment) return null;

      return prisma.mfaRecoveryCode.findFirst({
        where: { enrollmentId: enrollment.id, codeHash, usedAt: null },
        select: { id: true },
      });
    },

    async markRecoveryCodeUsed(id) {
      await prisma.mfaRecoveryCode.update({ where: { id }, data: { usedAt: new Date() } });
    },
  };
}
