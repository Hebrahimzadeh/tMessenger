import { z } from 'zod';

/** "متن ۱ تا ۴۰۰۰ نویسه". */
export const COMMENT_BODY_MIN = 1;
export const COMMENT_BODY_MAX = 4000;

export const commentBodySchema = z.string().trim().min(COMMENT_BODY_MIN).max(COMMENT_BODY_MAX);

export const createCommentBodySchema = z.object({
  body: commentBodySchema,
  /** A reply is constrained server-side to a comment on the *same* card. */
  parentId: z.string().uuid().optional(),
});
export type CreateCommentBody = z.infer<typeof createCommentBodySchema>;

export const editCommentBodySchema = z.object({
  body: commentBodySchema,
});
export type EditCommentBody = z.infer<typeof editCommentBodySchema>;

export const commentStatusSchema = z.enum(['VISIBLE', 'DELETED']);

export const commentViewSchema = z.object({
  id: z.string().uuid(),
  cardId: z.string().uuid(),
  authorId: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  status: commentStatusSchema,
  /** Null once soft-deleted - "حذف متن را پنهان ولی audit را حفظ". Always plain text; the client renders it as text, never HTML. */
  body: z.string().nullable(),
  revisionCount: z.number().int().nonnegative(),
  edited: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CommentView = z.infer<typeof commentViewSchema>;

export const commentListResponseSchema = z.object({
  items: z.array(commentViewSchema),
  nextCursor: z.string().nullable(),
});
export type CommentListResponse = z.infer<typeof commentListResponseSchema>;

export const cardReactionTypeSchema = z.enum(['SUPPORT', 'USEFUL', 'INTERESTED', 'CELEBRATE']);
export type CardReactionType = z.infer<typeof cardReactionTypeSchema>;

export const toggleReactionBodySchema = z.object({
  type: cardReactionTypeSchema,
});
export type ToggleReactionBody = z.infer<typeof toggleReactionBodySchema>;

export const reactionCountsSchema = z.object({
  SUPPORT: z.number().int().nonnegative(),
  USEFUL: z.number().int().nonnegative(),
  INTERESTED: z.number().int().nonnegative(),
  CELEBRATE: z.number().int().nonnegative(),
});
export type ReactionCounts = z.infer<typeof reactionCountsSchema>;

export const reactionSummarySchema = z.object({
  /** Per-type counts. A repeat of the same reaction toggles it off, so a count never inflates past the distinct-user total. */
  counts: reactionCountsSchema,
  /** The caller's own currently-set reactions (empty for an anonymous caller). */
  mine: z.array(cardReactionTypeSchema),
});
export type ReactionSummary = z.infer<typeof reactionSummarySchema>;

export const pinnedCardSchema = z.object({
  cardId: z.string().uuid(),
  position: z.number().int().nonnegative(),
  title: z.string(),
  pinnedAt: z.string().datetime(),
});
export type PinnedCard = z.infer<typeof pinnedCardSchema>;

export const pinnedCardListResponseSchema = z.object({
  items: z.array(pinnedCardSchema),
  /** The hard ceiling on pins per space - "ترتیب محدود". */
  limit: z.number().int().positive(),
});
export type PinnedCardListResponse = z.infer<typeof pinnedCardListResponseSchema>;
