import { z } from 'zod';

/** Shared shape for every cursor-paginated list endpoint. `cursor` is opaque - callers must never construct or inspect one, only pass back a value a previous response gave them. */
export const paginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
