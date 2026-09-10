import { z } from 'zod';

export const awarenessEventTypeSchema = z.enum([
  'PRODUCED',
  'MEANINGFUL_VIEW',
  'PUBLIC_CONTRIBUTION',
  'RESERVED',
  'PRIVATE_CHAT_STARTED',
  'APPLIED',
  'RESERVATION_CLOSED',
]);
export type AwarenessEventTypeContract = z.infer<typeof awarenessEventTypeSchema>;

export const recordCardViewResponseSchema = z.object({
  /** False only for a self-view (the card's own author) - never an error, just not counted. */
  recorded: z.boolean(),
});
export type RecordCardViewResponse = z.infer<typeof recordCardViewResponseSchema>;

/**
 * "فقط event label، زمان و deep-link نگه دار و category/status مشتق نکن" -
 * a participation-log row carries exactly its type, when it happened, and
 * where to go look - never a category, a status, a score, or any text.
 */
export const participationItemSchema = z.object({
  type: awarenessEventTypeSchema,
  createdAt: z.string().datetime(),
  deepLink: z.string().nullable(),
});
export type ParticipationItem = z.infer<typeof participationItemSchema>;

export const participationListResponseSchema = z.object({
  items: z.array(participationItemSchema),
  nextCursor: z.string().nullable(),
});
export type ParticipationListResponse = z.infer<typeof participationListResponseSchema>;

/** One calendar day of aggregate counts - never a raw actor/subject id, only totals. */
export const awarenessDailyAggregateSchema = z.object({
  date: z.string(),
  producedCount: z.number().int().nonnegative(),
  meaningfulViewCount: z.number().int().nonnegative(),
  publicContributionCount: z.number().int().nonnegative(),
  appliedCount: z.number().int().nonnegative(),
  privateChatStartedCount: z.number().int().nonnegative(),
  reservationClosedCount: z.number().int().nonnegative(),
});
export type AwarenessDailyAggregateContract = z.infer<typeof awarenessDailyAggregateSchema>;

export const awarenessMetricsResponseSchema = z.object({
  days: z.array(awarenessDailyAggregateSchema),
});
export type AwarenessMetricsResponse = z.infer<typeof awarenessMetricsResponseSchema>;
