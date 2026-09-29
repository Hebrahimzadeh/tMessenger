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

// Prompt archive review (owner request 2026-09-29).

export const spaceBuildDecisionSchema = z.enum(['PUBLISH', 'HUMAN_REVIEW', 'BLOCK']);
export type SpaceBuildDecisionContract = z.infer<typeof spaceBuildDecisionSchema>;

/**
 * One build, as a reviewer sees it.
 *
 * Every text field is nullable, and each null means something different:
 * `userPrompt`/`renderedPrompt` go null when the retention window expires
 * (`textPurgedAt` then says when), while `systemInstruction` is null when the
 * capability sent none and `space` is null when the build was refused and
 * nothing was made. The interface has to tell those apart, so the API does
 * not flatten them into one absence.
 */
export const spaceBuildAttemptSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  decision: spaceBuildDecisionSchema,
  reason: z.string(),
  policyVersionRef: z.string(),
  matchedPolicyRules: z.array(z.string()),
  creativityApplied: z.boolean(),
  documentRef: z.string().nullable(),
  creatorId: z.string().uuid(),
  space: z.object({ id: z.string().uuid(), slug: z.string(), title: z.string() }).nullable(),
  /** Verbatim, as the person typed it. Null once purged. */
  userPrompt: z.string().nullable(),
  /** Exactly the user turn sent to the model. Null once purged, and null when no model was asked. */
  renderedPrompt: z.string().nullable(),
  /** The document sent as the system instruction. Never purged - it is the project's own text. */
  systemInstruction: z.string().nullable(),
  textPurgedAt: z.string().datetime().nullable(),
  /** What the call cost and how it went, when there was one. */
  call: z
    .object({
      outcome: z.enum(['SUGGESTION', 'FALLBACK', 'UNAVAILABLE']),
      errorCode: z.string().nullable(),
      latencyMs: z.number().int(),
      model: z.string().nullable(),
      costMicros: z.number().int().nullable(),
    })
    .nullable(),
});
export type SpaceBuildAttemptContract = z.infer<typeof spaceBuildAttemptSchema>;

export const spaceBuildAttemptListResponseSchema = z.object({
  items: z.array(spaceBuildAttemptSchema),
  /** How long prompt text is kept, so the page can say so rather than have a reader guess. */
  retentionDays: z.number().int(),
});
export type SpaceBuildAttemptListResponse = z.infer<typeof spaceBuildAttemptListResponseSchema>;
