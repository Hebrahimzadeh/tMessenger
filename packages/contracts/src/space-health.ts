import { z } from 'zod';

export const spaceHealthStatusSchema = z.enum(['NEW', 'ACTIVE', 'FRAGILE', 'DORMANT']);
export type SpaceHealthStatusContract = z.infer<typeof spaceHealthStatusSchema>;

export const healthSuggestionCodeSchema = z.enum([
  'CREATE_FIRST_CARD',
  'IMPROVE_INTRO',
  'RECRUIT_UNDERACTIVE_ROLE',
  'CONSIDER_ARCHIVE_OR_SIMILAR',
]);
export type HealthSuggestionCodeContract = z.infer<typeof healthSuggestionCodeSchema>;

/**
 * GET /v1/spaces/:spaceId/health - creator/space-admin only. Deliberately a
 * vector of independent dimensions with no combined field anywhere in this
 * schema ("بدون score عددی واحد") - a single overall number is not just
 * omitted by convention, it has no field to hold it.
 */
export const spaceHealthResponseSchema = z.object({
  status: spaceHealthStatusSchema,
  cardCount: z.number().int(),
  contributorCount: z.number().int(),
  meaningfulViewCount: z.number().int(),
  firstUseLatencySeconds: z.number().int().nullable(),
  roleActivity: z.object({ totalRoleCount: z.number().int(), activeRoleCount: z.number().int() }),
  crossRoleCardRate: z.number(),
  appliedRate: z.number(),
  reservationClosedRate: z.number(),
  reportQuality: z.number().nullable(),
  lastActivityAt: z.string().datetime().nullable(),
  suggestions: z.array(z.object({ code: healthSuggestionCodeSchema })),
  computedAt: z.string().datetime(),
});
export type SpaceHealthResponse = z.infer<typeof spaceHealthResponseSchema>;
