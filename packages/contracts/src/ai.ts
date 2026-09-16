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
]);
export type AiOutput = z.infer<typeof aiOutputSchema>;

/** The schema for one capability's output, for validating in both directions. */
export const OUTPUT_SCHEMA_BY_CAPABILITY = {
  SPACE_GUIDANCE: spaceGuidanceOutputSchema,
  CARD_DRAFT: cardDraftOutputSchema,
  ASSISTANT_REPLY: assistantReplyOutputSchema,
  MODERATION_ASSIST: moderationAssistOutputSchema,
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
