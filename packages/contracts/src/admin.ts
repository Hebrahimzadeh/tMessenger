import { z } from 'zod';
import { roleKeySchema } from './role';

/** POST /v1/admin/role-assignments - SUPERADMIN + MFA only (see services/api/src/plugins/authorize.ts). */
export const assignRoleBodySchema = z.object({
  userId: z.string().uuid(),
  role: roleKeySchema,
});
export type AssignRoleBody = z.infer<typeof assignRoleBodySchema>;

export const assignRoleResponseSchema = z.object({
  created: z.boolean(),
});
export type AssignRoleResponse = z.infer<typeof assignRoleResponseSchema>;
