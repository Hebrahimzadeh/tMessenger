import { z } from 'zod';

export const spaceSearchScopeSchema = z.enum(['all', 'following']);
export type SpaceSearchScope = z.infer<typeof spaceSearchScopeSchema>;

/** GET /v1/spaces?q=&cursor=&limit=&scope= */
export const spaceSearchQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  scope: spaceSearchScopeSchema.default('all'),
});
export type SpaceSearchQuery = z.infer<typeof spaceSearchQuerySchema>;

export const spaceSearchItemSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  purpose: z.string(),
  followerCount: z.number().int(),
  publishedAt: z.string().datetime(),
});
export type SpaceSearchItem = z.infer<typeof spaceSearchItemSchema>;

export const spaceSearchResponseSchema = z.object({
  items: z.array(spaceSearchItemSchema),
  nextCursor: z.string().nullable(),
});
export type SpaceSearchResponse = z.infer<typeof spaceSearchResponseSchema>;

/** GET /v1/spaces/similar?title=&purpose= */
export const spaceSimilarQuerySchema = z.object({
  title: z.string().trim().min(1).max(200),
  purpose: z.string().trim().max(2000).default(''),
});
export type SpaceSimilarQuery = z.infer<typeof spaceSimilarQuerySchema>;

export const spaceSimilarItemSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  overlapScore: z.number(),
});
export type SpaceSimilarItem = z.infer<typeof spaceSimilarItemSchema>;

export const spaceSimilarResponseSchema = z.object({
  items: z.array(spaceSimilarItemSchema),
});
export type SpaceSimilarResponse = z.infer<typeof spaceSimilarResponseSchema>;

export const spaceFollowActionResponseSchema = z.object({ ok: z.literal(true) });
export type SpaceFollowActionResponse = z.infer<typeof spaceFollowActionResponseSchema>;
