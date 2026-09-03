import type { PrismaClient } from '@taavon/database';
import { encryptPhone, hashPhone } from './phone-crypto';

export interface BootstrapSuperadminResult {
  userId: string;
  created: boolean;
  roleAssigned: boolean;
}

const SUPERADMIN_ROLE_KEY = 'SUPERADMIN';
const BOOTSTRAP_AUDIT_ACTION = 'auth.bootstrap_superadmin';

export class SuperadminRoleNotSeededError extends Error {
  constructor() {
    super(`${SUPERADMIN_ROLE_KEY} role is not seeded - run database migrations before bootstrapping.`);
    this.name = 'SuperadminRoleNotSeededError';
  }
}

/**
 * Idempotently ensures exactly one User exists for phoneE164 and holds a
 * global SUPERADMIN role assignment (Task 05 acceptance: "دقیقاً یک user و
 * role assignment"). Safe to run any number of times - a second call finds
 * the existing PhoneIdentity (by hash) and RoleAssignment and reports
 * `created: false, roleAssigned: false` instead of creating duplicates.
 *
 * phoneE164 and phoneEncryptionKey are passed in rather than read from env
 * here, so the phone number is never hardcoded anywhere in source - the only
 * place it may come from is the BOOTSTRAP_SUPERADMIN_PHONE environment
 * variable, read by the caller (scripts/bootstrap-superadmin.mjs).
 */
export async function bootstrapSuperadmin(
  prisma: PrismaClient,
  phoneE164: string,
  phoneEncryptionKey: string
): Promise<BootstrapSuperadminResult> {
  const phoneHash = hashPhone(phoneE164, phoneEncryptionKey);

  return prisma.$transaction(async (tx) => {
    const existingIdentity = await tx.phoneIdentity.findUnique({
      where: { phoneHash },
      select: { userId: true },
    });

    let userId: string;
    let created = false;

    if (existingIdentity) {
      userId = existingIdentity.userId;
    } else {
      const user = await tx.user.create({ data: {} });
      userId = user.id;
      await tx.phoneIdentity.create({
        data: {
          userId,
          phoneHash,
          phoneCiphertext: encryptPhone(phoneE164, phoneEncryptionKey),
          verifiedAt: new Date(),
        },
      });
      created = true;
    }

    const role = await tx.role.findUnique({ where: { key: SUPERADMIN_ROLE_KEY } });
    if (!role) {
      throw new SuperadminRoleNotSeededError();
    }

    const existingAssignment = await tx.roleAssignment.findFirst({
      where: { userId, roleId: role.id, scopeType: 'GLOBAL', scopeId: null },
      select: { id: true },
    });

    let roleAssigned = false;
    if (!existingAssignment) {
      // No other admin can exist yet at bootstrap time, so the first
      // superadmin is necessarily self-assigned - this is the one place in
      // the system where assignedBy === userId is expected, not a bug.
      await tx.roleAssignment.create({
        data: { userId, roleId: role.id, scopeType: 'GLOBAL', scopeId: null, assignedBy: userId },
      });
      roleAssigned = true;
    }

    // Only write an audit event when something actually changed, so an
    // idempotent re-run - which by definition changes nothing - does not
    // accumulate a duplicate audit entry every time it runs. At least one
    // audit event always exists after the first successful bootstrap
    // (Task 05 acceptance: "audit موجود").
    if (created || roleAssigned) {
      await tx.auditEvent.create({
        data: {
          actorId: userId,
          action: BOOTSTRAP_AUDIT_ACTION,
          targetType: 'User',
          targetId: userId,
          correlationId: `bootstrap-${userId}`,
          metadata: { created, roleAssigned },
        },
      });
    }

    return { userId, created, roleAssigned };
  });
}
