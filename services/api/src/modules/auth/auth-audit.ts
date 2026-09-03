import type { PrismaClient } from '@taavon/database';

/**
 * Records the idempotent TermsAcceptance receipt(s) for a successful OTP
 * verify plus one audit event - batched as one transaction so a crash
 * between them can't leave an audit event with no matching acceptance (or
 * vice versa). `upsert` (not `create`) is what makes acceptance idempotent
 * across repeat logins under the same still-current version (Task 05's
 * unique constraint on userId/documentType/documentVersion would otherwise
 * reject the second login's write outright).
 */
export async function recordAcceptanceAndAudit(
  prisma: PrismaClient,
  userId: string,
  termsVersion: number,
  privacyVersion: number,
  otpChallengeId: string,
  created: boolean
): Promise<void> {
  const acceptedAt = new Date();

  await prisma.$transaction([
    prisma.termsAcceptance.upsert({
      where: { userId_documentType_documentVersion: { userId, documentType: 'TERMS', documentVersion: termsVersion } },
      create: { userId, documentType: 'TERMS', documentVersion: termsVersion, acceptedAt, otpChallengeId },
      update: {},
    }),
    prisma.termsAcceptance.upsert({
      where: {
        userId_documentType_documentVersion: { userId, documentType: 'PRIVACY', documentVersion: privacyVersion },
      },
      create: { userId, documentType: 'PRIVACY', documentVersion: privacyVersion, acceptedAt, otpChallengeId },
      update: {},
    }),
    prisma.auditEvent.create({
      data: {
        actorId: userId,
        action: 'auth.otp_verify_success',
        targetType: 'User',
        targetId: userId,
        correlationId: otpChallengeId,
        // No phone number, no OTP code - only ids/versions/booleans.
        metadata: { created, termsVersion, privacyVersion },
      },
    }),
  ]);
}

/** Audits a detected refresh-token reuse - the family was already revoked by the caller; this just records that it happened. */
export async function auditReuseDetected(prisma: PrismaClient, userId: string, tokenFamilyId: string): Promise<void> {
  await prisma.auditEvent.create({
    data: {
      actorId: userId,
      action: 'auth.refresh_reuse_detected',
      targetType: 'Session',
      targetId: null,
      correlationId: tokenFamilyId,
      metadata: { tokenFamilyId },
    },
  });
}
