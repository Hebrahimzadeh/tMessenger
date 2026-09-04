import type { RoleKey } from '@taavon/database';
import type { RoleAssignmentRepository } from '../auth/role-assignment.repository';
import type { IdentityClaimRepository } from '../identity-claim/identity-claim.service';

export class UnknownRoleError extends Error {
  constructor(public readonly roleKey: string) {
    super(`Unknown role: "${roleKey}".`);
    this.name = 'UnknownRoleError';
  }
}

export class IdentityClaimNotVerifiedError extends Error {
  constructor() {
    super('An elevated role requires the target user to have a VERIFIED official identity claim.');
    this.name = 'IdentityClaimNotVerifiedError';
  }
}

export interface RoleAssignmentServiceDeps {
  roleRepo: RoleAssignmentRepository;
  claimRepo: IdentityClaimRepository;
}

/**
 * Grants a GLOBAL-scope role. The bootstrap superadmin (Task 05's CLI
 * script, a separate code path entirely) is never assigned through here,
 * so "برای مدیران غیر bootstrap فقط پس از VERIFIED شدن claim" needs no
 * special-case exemption in this function - every caller of this endpoint
 * is, by construction, assigning a *non-bootstrap* admin.
 */
export async function assignRole(
  deps: RoleAssignmentServiceDeps,
  targetUserId: string,
  roleKey: RoleKey,
  assignedBy: string
): Promise<{ created: boolean }> {
  const roleId = await deps.roleRepo.findRoleIdByKey(roleKey);
  if (!roleId) throw new UnknownRoleError(roleKey);

  if (roleKey !== 'USER') {
    const claim = await deps.claimRepo.findByUserId(targetUserId);
    if (claim?.status !== 'VERIFIED') {
      throw new IdentityClaimNotVerifiedError();
    }
  }

  return deps.roleRepo.assignGlobalRole(targetUserId, roleId, assignedBy);
}
