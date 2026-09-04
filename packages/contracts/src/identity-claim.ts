import { z } from 'zod';

export const identityClaimStatusSchema = z.enum(['PENDING', 'VERIFIED', 'REJECTED']);
export type IdentityClaimStatus = z.infer<typeof identityClaimStatusSchema>;

/** POST /v1/me/identity-claim - the private, evidence-backed claim Task 09 requires before a non-bootstrap admin role can be granted. */
export const submitIdentityClaimBodySchema = z.object({
  evidence: z.string().trim().min(1).max(4000),
});
export type SubmitIdentityClaimBody = z.infer<typeof submitIdentityClaimBodySchema>;

export const myIdentityClaimResponseSchema = z.object({
  status: identityClaimStatusSchema,
});
export type MyIdentityClaimResponse = z.infer<typeof myIdentityClaimResponseSchema>;

/** GET /v1/admin/identity-claims - list view, deliberately no evidence field (see the detail endpoint for that). */
export const identityClaimSummarySchema = z.object({
  userId: z.string().uuid(),
  status: identityClaimStatusSchema,
});
export type IdentityClaimSummary = z.infer<typeof identityClaimSummarySchema>;

export const identityClaimListResponseSchema = z.object({
  claims: z.array(identityClaimSummarySchema),
});
export type IdentityClaimListResponse = z.infer<typeof identityClaimListResponseSchema>;

/** GET /v1/admin/identity-claims/:userId - admin review detail, decrypted evidence included. Admin tooling only - never the public profile. */
export const identityClaimDetailResponseSchema = z.object({
  status: identityClaimStatusSchema,
  evidence: z.string().nullable(),
});
export type IdentityClaimDetailResponse = z.infer<typeof identityClaimDetailResponseSchema>;

export const reviewIdentityClaimBodySchema = z.object({
  decision: z.enum(['VERIFIED', 'REJECTED']),
  reason: z.string().trim().max(1000).optional(),
});
export type ReviewIdentityClaimBody = z.infer<typeof reviewIdentityClaimBodySchema>;
