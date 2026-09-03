import type { PrismaClient } from '@taavon/database';

export interface FindOrCreateUserResult {
  userId: string;
  created: boolean;
}

/**
 * Find-or-create a User by phoneHash, exactly like bootstrap.ts's own
 * inline logic but without any role assignment (a regular OTP signup gets
 * no RoleAssignment row at all - "USER" is the implicit default tier for
 * any authenticated account; RoleAssignment exists only for the elevated,
 * explicitly-granted roles). Kept as a small separate function rather than
 * extracted/shared with bootstrap.ts, so Task 05's already-reviewed file
 * stays untouched.
 */
export async function findOrCreateUserByPhone(
  prisma: PrismaClient,
  phoneHash: string,
  phoneCiphertext: string
): Promise<FindOrCreateUserResult> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.phoneIdentity.findUnique({ where: { phoneHash }, select: { userId: true } });
    if (existing) {
      return { userId: existing.userId, created: false };
    }

    const user = await tx.user.create({ data: {} });
    await tx.phoneIdentity.create({
      data: { userId: user.id, phoneHash, phoneCiphertext, verifiedAt: new Date() },
    });
    return { userId: user.id, created: true };
  });
}
