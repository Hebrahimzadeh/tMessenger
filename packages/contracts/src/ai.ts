import { z } from 'zod';

/**
 * Where an input to the model came from.
 *
 * `PRIVATE_DIRECT_MESSAGE` is deliberately not a member, and its absence is
 * the design rather than an omission. A value that does not exist cannot be
 * passed, cannot be stored, and cannot be added without a migration and a
 * schema change somebody has to review.
 *
 * `ASSISTANT_CONVERSATION` is what a person says *to the assistant* in their
 * own helper thread. That is a different thing from what two people say to
 * each other, and the policy guard verifies the difference against the
 * database rather than trusting this label.
 */
export const aiInputSourceSchema = z.enum([
  'PUBLIC_USER_INPUT',
  'PUBLIC_SPACE_DATA',
  'ASSISTANT_CONVERSATION',
  'MODERATION_GRANTED_CONTEXT',
]);
export type AiInputSource = z.infer<typeof aiInputSourceSchema>;

export const aiCapabilitySchema = z.enum([
  'SPACE_GUIDANCE',
  'CARD_DRAFT',
  'ASSISTANT_REPLY',
  'MODERATION_ASSIST',
  'SPACE_BUILD',
]);
export type AiCapability = z.infer<typeof aiCapabilitySchema>;

export const aiOutcomeSchema = z.enum(['SUGGESTION', 'FALLBACK', 'UNAVAILABLE']);
export type AiOutcome = z.infer<typeof aiOutcomeSchema>;

/**
 * Where a piece of text actually came from, as a checkable claim rather than
 * a label.
 *
 * Every input must carry one - "provenance هر ورودی را اجباری". The guard
 * uses it to verify the claimed source against reality: a caller saying
 * `ASSISTANT_CONVERSATION` must name a conversation, and that conversation
 * must actually be the assistant's kind, which is checked in the database.
 */
export const aiProvenanceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('USER_TYPED') }),
  z.object({ kind: z.literal('SPACE'), spaceId: z.string().uuid() }),
  z.object({ kind: z.literal('CARD'), cardId: z.string().uuid() }),
  z.object({ kind: z.literal('ASSISTANT_THREAD'), conversationId: z.string().uuid() }),
  z.object({ kind: z.literal('MODERATION_GRANT'), grantId: z.string().uuid() }),
]);
export type AiProvenance = z.infer<typeof aiProvenanceSchema>;

/** The longest input any capability will accept, before minimization trims further. */
export const AI_INPUT_MAX_CHARS = 8000;

export const aiRequestInputSchema = z.object({
  capability: aiCapabilitySchema,
  source: aiInputSourceSchema,
  text: z.string().trim().min(1).max(AI_INPUT_MAX_CHARS),
  provenance: aiProvenanceSchema,
});
export type AiRequestInput = z.infer<typeof aiRequestInputSchema>;

// --- capability output schemas ------------------------------------------
// Enforced twice: once on what the model returned, and again before anything
// reaches the domain. "Zod schema را پیش و پس از provider enforce کن."

export const spaceGuidanceOutputSchema = z.object({
  kind: z.literal('SPACE_GUIDANCE'),
  headline: z.string().min(1).max(200),
  suggestions: z.array(z.string().min(1).max(300)).min(1).max(5),
});

// --- Task 24: the full space-creation guidance shape ---------------------

export const creationDecisionSchema = z.enum(['ALLOW', 'REVISE', 'HUMAN_REVIEW', 'BLOCK']);
export type CreationDecision = z.infer<typeof creationDecisionSchema>;

export const safetyLevelSchema = z.enum(['NORMAL', 'REVIEW', 'SEVERE']);
export type SafetyLevel = z.infer<typeof safetyLevelSchema>;

/**
 * A change the guidance proposes. Every one is optional for the person to take.
 *
 * `value` is a *draft they could accept*, never an empty prompt to fill in: a
 * revision with nothing in it is a form field wearing a suggestion's clothes,
 * and this task exists to avoid exactly that. The schema enforces it by
 * refusing an empty string.
 */
export const suggestedRevisionSchema = z.object({
  field: z.enum(['title', 'purpose', 'participationMethods', 'participationRoles']),
  value: z.string().min(1).max(4000),
  reason: z.string().min(1).max(500),
});

export const participationRoleSuggestionSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  isPrimary: z.boolean(),
});

/**
 * A sample card, shown so someone can see what their space would actually
 * hold. `isExample` is a literal `true` and `notice` is a fixed string, both
 * fixed in the schema rather than left to a caller or a model: an example
 * that can be mistaken for real content is worse than no example at all, and
 * a flag anything could set to false is not a flag.
 */
export const EXAMPLE_CARD_NOTICE = 'نمونه — محتوای واقعی نیست';

export const exampleCardTemplateSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  isExample: z.literal(true),
  notice: z.literal(EXAMPLE_CARD_NOTICE),
});

/**
 * Everything the guidance produces about one proposed space.
 *
 * Two things are deliberately absent, and their absence is the design. There
 * is no score for the person who wrote it, and no judgement of their piety or
 * sincerity - "هیچ piety/person score". The output describes a *proposal*:
 * what it assumes, where it is strong, what could go wrong, and what to ask.
 * Nothing here ranks a human being.
 */
export const spaceCreationGuidanceSchema = z.object({
  title: z.string().min(1).max(200),
  purpose: z.string().min(1).max(4000),
  /** What the guidance had to assume because the description did not say. Shown, never hidden. */
  assumptions: z.array(z.string().min(1).max(300)).max(10),
  strengths: z.array(z.string().min(1).max(300)).max(10),
  risks: z.array(z.string().min(1).max(300)).max(10),
  questions: z.array(z.string().min(1).max(300)).max(10),
  suggestedRevisions: z.array(suggestedRevisionSchema).max(10),
  participationRoles: z.array(participationRoleSuggestionSchema).max(8),
  valueChainNodes: z.array(z.string().min(1).max(200)).max(12),
  exampleCardTemplates: z.array(exampleCardTemplateSchema).max(6),
  suggestedToolKeys: z.array(z.string().min(1).max(60)).max(10),
  creationDecision: creationDecisionSchema,
  /** The policy rules that actually matched. A BLOCK with an empty list is impossible by construction. */
  matchedPolicyRules: z.array(z.string().min(1).max(120)).max(20),
  safetyLevel: safetyLevelSchema,
  /** Which baseline the decision came from, so a verdict stays traceable after the wording changes. */
  policyVersionRef: z.string().min(1).max(200),
});
export type SpaceCreationGuidance = z.infer<typeof spaceCreationGuidanceSchema>;

// --- One-prompt space building (owner decision 2026-09-17) ----------------

/** How long a person's prompt may be. Long enough to describe an idea, short enough to stay a prompt. */
export const SPACE_BUILD_PROMPT_MAX_CHARS = 2000;

export const spaceBuildRoleSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(300).default(''),
  isPrimary: z.boolean(),
});

export const spaceBuildCardHintSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).default(''),
});

/**
 * A whole space, from one prompt.
 *
 * The shape is exactly what the space model can store and nothing more, so
 * a model cannot smuggle in a field the domain would quietly drop or, worse,
 * one it would act on. Role keys are deliberately absent: they must match
 * `^[a-z0-9_-]+$`, a model writing Persian gets them wrong constantly, and a
 * key carries no meaning a person would ever see - the server assigns them.
 *
 * "Exactly two primary roles" is enforced here rather than trusted, because
 * it is what publishing requires and a model saying so is not the same as it
 * being so.
 *
 * `reviewNote` is the model's only lever on the outcome, and it only points
 * one way: filling it holds a space back for a person to look at. It cannot
 * publish anything, block anything, or change what the policy rules decide.
 */
export const spaceBuildOutputSchema = z
  .object({
    kind: z.literal('SPACE_BUILD'),
    title: z.string().trim().min(3).max(80),
    description: z.string().trim().min(40).max(1200),
    audience: z.string().trim().max(300).default(''),
    participationMethods: z.array(z.string().trim().min(1).max(100)).min(1).max(5),
    roles: z.array(spaceBuildRoleSchema).min(2).max(6),
    cardHints: z.array(spaceBuildCardHintSchema).max(3).default([]),
    reviewNote: z.string().trim().max(300).default(''),
  })
  .refine((space) => space.roles.filter((role) => role.isPrimary).length === 2, {
    message: 'A space needs exactly two primary roles.',
    path: ['roles'],
  });
export type SpaceBuildOutput = z.infer<typeof spaceBuildOutputSchema>;

export const buildSpaceBodySchema = z.object({
  prompt: z.string().trim().min(1).max(SPACE_BUILD_PROMPT_MAX_CHARS),
});
export type BuildSpaceBody = z.infer<typeof buildSpaceBodySchema>;

/**
 * What happened to a prompt.
 *
 * PUBLISHED - the space exists and is public; `space` points at it.
 * HUMAN_REVIEW - the space exists, belongs to the person, and is not public
 *   until someone looks; `space` points at it so they can still see it.
 * BLOCKED - an explicit SEVERE rule matched, and nothing was created at all.
 */
export const buildSpaceResponseSchema = z.object({
  outcome: z.enum(['PUBLISHED', 'HUMAN_REVIEW', 'BLOCKED']),
  space: z.object({ id: z.string().uuid(), slug: z.string() }).nullable(),
  reason: z.string(),
  matchedPolicyRules: z.array(z.string()),
  policyVersionRef: z.string(),
  /** False when rules alone built the space because no model answered. Shown, never hidden. */
  creativityApplied: z.boolean(),
});
export type BuildSpaceResponse = z.infer<typeof buildSpaceResponseSchema>;

export const cardDraftOutputSchema = z.object({
  kind: z.literal('CARD_DRAFT'),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(4000),
});

export const assistantReplyOutputSchema = z.object({
  kind: z.literal('ASSISTANT_REPLY'),
  reply: z.string().min(1).max(4000),
});

export const moderationAssistOutputSchema = z.object({
  kind: z.literal('MODERATION_ASSIST'),
  summary: z.string().min(1).max(2000),
  /** A view, never a verdict - a person decides, always. */
  concerns: z.array(z.string().min(1).max(300)).max(10),
});

export const aiOutputSchema = z.discriminatedUnion('kind', [
  spaceGuidanceOutputSchema,
  cardDraftOutputSchema,
  assistantReplyOutputSchema,
  moderationAssistOutputSchema,
  spaceBuildOutputSchema,
]);
export type AiOutput = z.infer<typeof aiOutputSchema>;

/** The schema for one capability's output, for validating in both directions. */
export const OUTPUT_SCHEMA_BY_CAPABILITY = {
  SPACE_GUIDANCE: spaceGuidanceOutputSchema,
  CARD_DRAFT: cardDraftOutputSchema,
  ASSISTANT_REPLY: assistantReplyOutputSchema,
  MODERATION_ASSIST: moderationAssistOutputSchema,
  SPACE_BUILD: spaceBuildOutputSchema,
} as const;

export const aiResultViewSchema = z.object({
  requestId: z.string().uuid(),
  outcome: aiOutcomeSchema,
  /** Present for SUGGESTION and FALLBACK; null for UNAVAILABLE. */
  output: aiOutputSchema.nullable(),
  /** Machine-readable reason when the outcome is not SUGGESTION. */
  errorCode: z.string().nullable(),
});
export type AiResultView = z.infer<typeof aiResultViewSchema>;

/** Every refusal or failure the orchestrator reports, named so callers can branch on them. */
export const AI_ERROR_CODES = {
  /** Someone tried to feed private correspondence to the model. */
  privateInputForbidden: 'AI_PRIVATE_INPUT_FORBIDDEN',
  /** This capability is not allowed to read this source at all. */
  sourceNotAllowed: 'AI_SOURCE_NOT_ALLOWED',
  /** The provenance did not match the claimed source when checked. */
  provenanceMismatch: 'AI_PROVENANCE_MISMATCH',
  quotaExceeded: 'AI_QUOTA_EXCEEDED',
  budgetExhausted: 'AI_BUDGET_EXHAUSTED',
  timeout: 'AI_TIMEOUT',
  providerFailed: 'AI_PROVIDER_FAILED',
  /** The model answered with something the capability's schema rejected. */
  invalidOutput: 'AI_INVALID_OUTPUT',
  circuitOpen: 'AI_CIRCUIT_OPEN',
  disabled: 'AI_DISABLED',
} as const;
export type AiErrorCode = (typeof AI_ERROR_CODES)[keyof typeof AI_ERROR_CODES];
