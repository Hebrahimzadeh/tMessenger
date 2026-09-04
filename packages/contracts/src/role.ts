import { z } from 'zod';

/** Mirrors packages/database/prisma/schema.prisma's RoleKey enum exactly. */
export const roleKeySchema = z.enum(['USER', 'SPACE_ADMIN', 'MODERATOR', 'SENIOR_ADMIN', 'SUPERADMIN', 'OPS']);
export type RoleKeyContract = z.infer<typeof roleKeySchema>;
