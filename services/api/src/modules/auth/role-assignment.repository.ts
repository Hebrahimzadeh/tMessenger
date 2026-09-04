import type { PrismaClient, RoleKey } from '@taavon/database';

export interface RoleAssignmentRepository {
  /** GLOBAL-scope roles only - SPACE-scoped roles (SPACE_ADMIN of one specific space) aren't meaningful until real spaces exist. */
  getGlobalRoleKeysForUser(userId: string): Promise<Set<RoleKey>>;
  findRoleIdByKey(roleKey: RoleKey): Promise<string | null>;
  assignGlobalRole(userId: string, roleId: string, assignedBy: string): Promise<{ created: boolean }>;
}

export function createPrismaRoleAssignmentRepository(prisma: PrismaClient): RoleAssignmentRepository {
  return {
    async getGlobalRoleKeysForUser(userId) {
      const assignments = await prisma.roleAssignment.findMany({
        where: { userId, scopeType: 'GLOBAL' },
        select: { role: { select: { key: true } } },
      });
      return new Set(assignments.map((a) => a.role.key));
    },

    async findRoleIdByKey(roleKey) {
      const role = await prisma.role.findUnique({ where: { key: roleKey }, select: { id: true } });
      return role?.id ?? null;
    },

    async assignGlobalRole(userId, roleId, assignedBy) {
      const existing = await prisma.roleAssignment.findFirst({
        where: { userId, roleId, scopeType: 'GLOBAL', scopeId: null },
        select: { id: true },
      });
      if (existing) return { created: false };

      await prisma.roleAssignment.create({
        data: { userId, roleId, scopeType: 'GLOBAL', scopeId: null, assignedBy },
      });
      return { created: true };
    },
  };
}
