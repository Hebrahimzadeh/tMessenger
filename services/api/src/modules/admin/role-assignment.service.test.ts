import { describe, expect, it } from 'vitest';
import type { IdentityClaimRepository } from '../identity-claim/identity-claim.service';
import type { RoleAssignmentRepository } from '../auth/role-assignment.repository';
import { assignRole, IdentityClaimNotVerifiedError, UnknownRoleError } from './role-assignment.service';
import type { RoleKey } from '@taavon/database';

function fakeRoleRepo(knownRoles: RoleKey[] = ['USER', 'SPACE_ADMIN', 'MODERATOR', 'SENIOR_ADMIN', 'SUPERADMIN', 'OPS']) {
  const assignments: Array<{ userId: string; roleId: string; assignedBy: string }> = [];
  const repo: RoleAssignmentRepository = {
    async getGlobalRoleKeysForUser() {
      return new Set();
    },
    async findRoleIdByKey(roleKey) {
      return knownRoles.includes(roleKey) ? `role-id-${roleKey}` : null;
    },
    async assignGlobalRole(userId, roleId, assignedBy) {
      const existing = assignments.find((a) => a.userId === userId && a.roleId === roleId);
      if (existing) return { created: false };
      assignments.push({ userId, roleId, assignedBy });
      return { created: true };
    },
  };
  return { repo, assignments };
}

function fakeClaimRepo(status: 'PENDING' | 'VERIFIED' | 'REJECTED' | null) {
  const repo: IdentityClaimRepository = {
    async findByUserId() {
      return status ? { status } : null;
    },
    async findWithEvidenceByUserId() {
      return status ? { status, evidenceCiphertext: null } : null;
    },
    async upsertPending() {},
    async review() {},
    async findPending() {
      return [];
    },
  };
  return repo;
}

describe('assignRole', () => {
  it('assigns USER without needing a verified claim', async () => {
    const { repo, assignments } = fakeRoleRepo();
    const result = await assignRole({ roleRepo: repo, claimRepo: fakeClaimRepo(null) }, 'user-1', 'USER', 'admin-1');
    expect(result.created).toBe(true);
    expect(assignments).toHaveLength(1);
  });

  it('assigns an elevated role when the target has a VERIFIED claim', async () => {
    const { repo } = fakeRoleRepo();
    const result = await assignRole({ roleRepo: repo, claimRepo: fakeClaimRepo('VERIFIED') }, 'user-1', 'MODERATOR', 'admin-1');
    expect(result.created).toBe(true);
  });

  it('throws IdentityClaimNotVerifiedError for an elevated role with no claim at all', async () => {
    const { repo } = fakeRoleRepo();
    await expect(
      assignRole({ roleRepo: repo, claimRepo: fakeClaimRepo(null) }, 'user-1', 'MODERATOR', 'admin-1')
    ).rejects.toThrow(IdentityClaimNotVerifiedError);
  });

  it('throws IdentityClaimNotVerifiedError for an elevated role with a PENDING claim', async () => {
    const { repo } = fakeRoleRepo();
    await expect(
      assignRole({ roleRepo: repo, claimRepo: fakeClaimRepo('PENDING') }, 'user-1', 'SENIOR_ADMIN', 'admin-1')
    ).rejects.toThrow(IdentityClaimNotVerifiedError);
  });

  it('throws IdentityClaimNotVerifiedError for an elevated role with a REJECTED claim', async () => {
    const { repo } = fakeRoleRepo();
    await expect(
      assignRole({ roleRepo: repo, claimRepo: fakeClaimRepo('REJECTED') }, 'user-1', 'OPS', 'admin-1')
    ).rejects.toThrow(IdentityClaimNotVerifiedError);
  });

  it('throws UnknownRoleError for a role key the database has no seeded row for', async () => {
    const { repo } = fakeRoleRepo([]);
    await expect(
      assignRole({ roleRepo: repo, claimRepo: fakeClaimRepo('VERIFIED') }, 'user-1', 'SUPERADMIN', 'admin-1')
    ).rejects.toThrow(UnknownRoleError);
  });

  it('is idempotent - assigning the same role twice reports created:false the second time, no duplicate', async () => {
    const { repo, assignments } = fakeRoleRepo();
    await assignRole({ roleRepo: repo, claimRepo: fakeClaimRepo('VERIFIED') }, 'user-1', 'MODERATOR', 'admin-1');
    const second = await assignRole({ roleRepo: repo, claimRepo: fakeClaimRepo('VERIFIED') }, 'user-1', 'MODERATOR', 'admin-1');
    expect(second.created).toBe(false);
    expect(assignments).toHaveLength(1);
  });
});
