import { spaceCreationGuidanceSchema } from './ai';
import { z } from 'zod';

export const spaceStatusSchema = z.enum([
  'DRAFT',
  'PRECHECK_REQUIRED',
  'HUMAN_REVIEW',
  'PUBLISHED',
  'TEMPORARILY_SUSPENDED',
  'ARCHIVED',
  'REMOVED',
]);
export type SpaceStatus = z.infer<typeof spaceStatusSchema>;

export const spaceGateVerdictSchema = z.enum(['ALLOW', 'REVISE', 'HUMAN_REVIEW', 'BLOCK']);
export type SpaceGateVerdict = z.infer<typeof spaceGateVerdictSchema>;

/** A card-template hint on a space's definition - descriptive JSON only, never used to create a real card/identity/participation record (see space.service.ts). */
export const spaceCardHintSchema = z.object({
  isExample: z.literal(true),
  label: z.literal('نمونه'),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
});
export type SpaceCardHint = z.infer<typeof spaceCardHintSchema>;

/** One participation-role slot in a space's definition body - `key` is a stable, space-scoped identifier (see schema.prisma's SpaceParticipationRole). */
export const spaceRoleInputSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9_-]+$/, 'key باید فقط شامل حروف لاتین کوچک، رقم، خط تیره یا زیرخط باشد.'),
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  isPrimary: z.boolean(),
});
export type SpaceRoleInput = z.infer<typeof spaceRoleInputSchema>;

/** POST /v1/spaces - deliberately minimal: just enough to claim a slug and start a draft. Everything else is filled in via PATCH. */
export const createSpaceBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
});
export type CreateSpaceBody = z.infer<typeof createSpaceBodySchema>;

/** PATCH /v1/spaces/:id - the full definition body. Structurally lenient (e.g. only one role, or zero participation methods, is accepted here) - `publish` is what actually enforces the plan's minimums; see space.service.ts's publishSpace. */
export const updateSpaceDefinitionBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  purpose: z.string().trim().max(2000),
  audience: z.string().trim().max(500).optional(),
  participationMethods: z.array(z.string().trim().min(1).max(100)).max(20),
  cardHints: z.array(spaceCardHintSchema).max(10).optional(),
  roles: z.array(spaceRoleInputSchema).max(20),
  policyVersion: z.number().int().positive(),
});
export type UpdateSpaceDefinitionBody = z.infer<typeof updateSpaceDefinitionBodySchema>;

export const spaceRoleSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  isPrimary: z.boolean(),
});
export type SpaceRoleContract = z.infer<typeof spaceRoleSchema>;

export const spaceDefinitionSchema = z.object({
  versionNumber: z.number().int().positive(),
  title: z.string(),
  purpose: z.string(),
  audience: z.string().nullable(),
  participationMethods: z.array(z.string()),
  cardHints: z.array(spaceCardHintSchema).nullable(),
  policyVersion: z.number().int(),
  roles: z.array(spaceRoleSchema),
});
export type SpaceDefinitionContract = z.infer<typeof spaceDefinitionSchema>;

/**
 * GET /v1/spaces/:idOrSlug response. `gate` is present only for the
 * owner/admin view of a non-published space (never on the public view - it
 * is internal pre-publish moderation state, not something to expose to
 * every visitor, and meaningless once actually published). `canManage` is
 * the frontend's real, always-present "is this caller the creator/a space
 * admin" signal (Task 13 found this gap: relying on `gate`'s mere presence
 * to decide this, as Task 10/11/12's UI originally did, silently breaks
 * once a space is PUBLISHED - `gate` is always omitted then regardless of
 * who's asking - which is exactly when an owner-only feature like Task
 * 13's own health panel matters most).
 */
export const spaceResponseSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  status: spaceStatusSchema,
  creatorId: z.string().uuid(),
  publishedAt: z.string().datetime().nullable(),
  archivedAt: z.string().datetime().nullable(),
  definition: spaceDefinitionSchema,
  canManage: z.boolean(),
  /** How many people follow this space - what its page calls "مشارکت‌کننده". */
  followerCount: z.number().int(),
  /** Whether the caller is one of them. Always false for an anonymous visitor. */
  isFollowing: z.boolean(),
  gate: z.object({ verdict: spaceGateVerdictSchema.nullable(), reason: z.string().nullable() }).optional(),
});
export type SpaceResponse = z.infer<typeof spaceResponseSchema>;

/**
 * The precheck result, with the baseline that produced it.
 *
 * `policyVersionRef` and `matchedPolicyRules` travel with the verdict rather
 * than being looked up later, because a BLOCK nobody can trace back to a rule
 * and a law is a refusal without a reason. `guidance` is the creative half
 * and is null when the gate failed closed - the verdict still stands, there
 * is simply nothing to show alongside it.
 */
export const precheckSpaceResponseSchema = z.object({
  verdict: spaceGateVerdictSchema,
  reason: z.string(),
  status: spaceStatusSchema,
  policyVersionRef: z.string(),
  matchedPolicyRules: z.array(z.string()),
  guidance: spaceCreationGuidanceSchema.nullable(),
});
export type PrecheckSpaceResponse = z.infer<typeof precheckSpaceResponseSchema>;

export const publishSpaceResponseSchema = z.object({
  status: spaceStatusSchema,
  publishedAt: z.string().datetime(),
});
export type PublishSpaceResponse = z.infer<typeof publishSpaceResponseSchema>;

export const archiveSpaceResponseSchema = z.object({
  status: spaceStatusSchema,
  archivedAt: z.string().datetime(),
});
export type ArchiveSpaceResponse = z.infer<typeof archiveSpaceResponseSchema>;

export const spaceRoleMembershipActionResponseSchema = z.object({ ok: z.literal(true) });
export type SpaceRoleMembershipActionResponse = z.infer<typeof spaceRoleMembershipActionResponseSchema>;

export const createSpaceInviteResponseSchema = z.object({
  token: z.string(),
});
export type CreateSpaceInviteResponse = z.infer<typeof createSpaceInviteResponseSchema>;

/** GET /v1/spaces/invites/:token - resolves a shortcut token to the space it points to. Grants no permission of its own (see schema.prisma's SpaceInvite comment) - the client still fetches the space normally afterward, subject to the same visibility rules as any other caller. */
export const resolveSpaceInviteResponseSchema = z.object({
  spaceId: z.string().uuid(),
  slug: z.string(),
});
export type ResolveSpaceInviteResponse = z.infer<typeof resolveSpaceInviteResponseSchema>;

/**
 * One row in `GET /v1/spaces/mine` - the caller's own spaces, whatever their
 * status.
 *
 * Separate from `spaceSearchItemSchema` on purpose: search is the public,
 * ranked, PUBLISHED-only index, and a space still waiting for a person to
 * look at it has no `publishedAt` and no business being ranked against
 * everyone else's. This list is the person's own shelf, newest first, and is
 * the only place a space of theirs that is not yet published can be reached
 * from a list at all.
 */
export const mySpaceItemSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  purpose: z.string(),
  status: spaceStatusSchema,
  createdAt: z.string().datetime(),
});
export type MySpaceItem = z.infer<typeof mySpaceItemSchema>;

export const mySpacesResponseSchema = z.object({ items: z.array(mySpaceItemSchema) });
export type MySpacesResponse = z.infer<typeof mySpacesResponseSchema>;
