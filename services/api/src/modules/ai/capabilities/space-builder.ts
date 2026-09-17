import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { SpaceBuildOutput } from '@taavon/contracts';
import type { AiOrchestrator } from '../orchestrator';
import { evaluatePolicy, policyVersionRef, type PolicyEvaluation, type PolicyRule, type PolicyRuleSource } from './policy-rules';
import { buildSpaceFromRules } from './space-builder-rules';

/**
 * The space-builder document, versioned with the code.
 *
 * A file rather than a string constant so it can be read and reviewed as a
 * document - it is the owner's framework written for a model, not an
 * implementation detail - and a file in this directory rather than a
 * database row so a change to it goes through the same review as a change to
 * the code that depends on it.
 */
export const SPACE_BUILDER_DOCUMENT = readFileSync(new URL('./space-builder.md', import.meta.url), 'utf8');

/** Which exact wording built a space, so a result stays traceable after the document changes. */
export const SPACE_BUILDER_DOCUMENT_REF = `space-builder:v1:${createHash('sha256').update(SPACE_BUILDER_DOCUMENT).digest('hex').slice(0, 12)}`;

const OPEN_MARKER = '<<<درخواست_کاربر';
const CLOSE_MARKER = 'درخواست_کاربر>>>';

/** Designing a whole space is a longer answer than any other capability produces. */
export const SPACE_BUILD_TIMEOUT_MS = 30_000;
/**
 * Generous on purpose. Persian tokenises densely, and current Gemini models
 * spend part of this budget on thinking before they write - too low a cap
 * returns a truncated object the schema then rejects.
 */
export const SPACE_BUILD_MAX_OUTPUT_TOKENS = 8192;
/** How long the policy baseline may take before the build treats it as unavailable. */
const POLICY_TIMEOUT_MS = 5_000;

/**
 * Wraps the person's prompt so the document can tell the model where it
 * starts and stops.
 *
 * The markers are stripped from the prompt first, or a prompt containing the
 * closing marker could end the block early and have everything after it read
 * as part of the document.
 */
export function renderUserPrompt(prompt: string): string {
  const neutralised = prompt.replaceAll('<<<', '‹‹‹').replaceAll('>>>', '›››');
  return `${OPEN_MARKER}\n${neutralised}\n${CLOSE_MARKER}`;
}

/** The inverse, for the orchestrator's own fallback, which only ever sees the rendered text. */
export function extractUserPrompt(rendered: string): string {
  const start = rendered.indexOf(OPEN_MARKER);
  const end = rendered.lastIndexOf(CLOSE_MARKER);
  if (start === -1 || end === -1 || end <= start) return rendered.trim();
  return rendered.slice(start + OPEN_MARKER.length, end).trim();
}

export type SpaceBuildDecision = 'PUBLISH' | 'HUMAN_REVIEW' | 'BLOCK';

export interface SpaceBuildResult {
  decision: SpaceBuildDecision;
  /** Null only when blocked: nothing is built for something that may not exist. */
  space: SpaceBuildOutput | null;
  reason: string;
  matchedPolicyRules: string[];
  policyVersionRef: string;
  creativityApplied: boolean;
  documentRef: string;
}

export interface SpaceBuildDeps {
  orchestrator: AiOrchestrator;
  policy: PolicyRuleSource;
}

const REASONS = {
  PUBLISH: 'بستر ساخته و منتشر شد.',
  HUMAN_REVIEW: 'بستر ساخته شد و پس از نگاه یک نفر منتشر می‌شود. چیزی رد نشده است.',
  BLOCK: 'این درخواست با یکی از قواعد صریح پلتفرم مغایرت دارد و بستری ساخته نشد. متن دیگری بنویسید.',
  UNAVAILABLE: 'بررسی خودکار قواعد در دسترس نبود، بنابراین بستر پس از نگاه یک نفر منتشر می‌شود.',
} as const;

async function loadRules(policy: PolicyRuleSource): Promise<PolicyRule[] | null> {
  try {
    const rules = await Promise.race([
      policy.currentRules(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('POLICY_TIMEOUT')), POLICY_TIMEOUT_MS)),
    ]);
    // An empty baseline matches nothing and would read as a clean bill of
    // health, which is the outage worth guarding against most.
    return rules.length > 0 ? rules : null;
  } catch {
    return null;
  }
}

function cite(evaluations: PolicyEvaluation[]): string[] {
  const seen = new Set<string>();
  for (const evaluation of evaluations) {
    for (const match of evaluation.matched) seen.add(`${match.key}@v${match.version} — ${match.source}`);
  }
  return [...seen];
}

const isSevere = (evaluation: PolicyEvaluation) => evaluation.matched.some((m) => m.severity === 'SEVERE');
const hasReviewRule = (evaluation: PolicyEvaluation) => evaluation.matched.some((m) => m.severity === 'REVIEW');

/** Everything a visitor will read, which is what the policy has to be checked against. */
function publicTextOf(space: SpaceBuildOutput): string {
  return [
    space.title,
    space.description,
    space.audience,
    ...space.participationMethods,
    ...space.roles.flatMap((role) => [role.title, role.description]),
    ...space.cardHints.flatMap((hint) => [hint.title, hint.description]),
  ].join('\n');
}

/**
 * Builds a whole space from one prompt.
 *
 * The same division of labour as Tasks 24 and 25: the model writes, the rules
 * decide. The model designs the space from the document; the versioned policy
 * baseline alone decides whether it may exist, and it is checked twice - on
 * what the person asked for, before anything is sent anywhere, and on what the
 * model produced, because a model can be talked into writing what a prompt
 * only hinted at.
 *
 * Ambiguity signals (disagreement, satire, citation) are read from the
 * person's prompt only. Reading them from the model's own prose would hold
 * back an ordinary space for describing "respectful disagreement" in its
 * rules, which is the model doing its job. The model's one lever is
 * `reviewNote`, and it only ever holds a space back for a person to see.
 */
export async function buildSpace(deps: SpaceBuildDeps, prompt: string, requesterId: string | null): Promise<SpaceBuildResult> {
  const rules = await loadRules(deps.policy);
  const baselineRef = rules ? policyVersionRef(rules) : 'unavailable';

  const promptEvaluation = rules ? evaluatePolicy(prompt, rules) : null;
  if (promptEvaluation && isSevere(promptEvaluation)) {
    // Never sent to a model: there is nothing to design for something that
    // may not exist, and no budget should be spent finding that out.
    return {
      decision: 'BLOCK',
      space: null,
      reason: REASONS.BLOCK,
      matchedPolicyRules: cite([promptEvaluation]),
      policyVersionRef: baselineRef,
      creativityApplied: false,
      documentRef: SPACE_BUILDER_DOCUMENT_REF,
    };
  }

  let space: SpaceBuildOutput = buildSpaceFromRules(prompt);
  let creativityApplied = false;
  try {
    const result = await deps.orchestrator.generate(
      {
        capability: 'SPACE_BUILD',
        source: 'PUBLIC_USER_INPUT',
        text: renderUserPrompt(prompt),
        provenance: { kind: 'USER_TYPED' },
      },
      requesterId,
      {
        systemInstruction: SPACE_BUILDER_DOCUMENT,
        timeoutMs: SPACE_BUILD_TIMEOUT_MS,
        maxOutputTokens: SPACE_BUILD_MAX_OUTPUT_TOKENS,
      }
    );
    if (result.outcome === 'SUGGESTION' && result.output?.kind === 'SPACE_BUILD') {
      space = result.output;
      creativityApplied = true;
    }
  } catch {
    // The orchestrator only throws on a policy refusal, which USER_TYPED
    // public input cannot trigger. Anything unexpected still leaves the
    // rule-built space in place rather than failing the person's request.
  }

  const outputEvaluation = rules ? evaluatePolicy(publicTextOf(space), rules) : null;
  if (outputEvaluation && isSevere(outputEvaluation)) {
    return {
      decision: 'BLOCK',
      space: null,
      reason: REASONS.BLOCK,
      matchedPolicyRules: cite([outputEvaluation]),
      policyVersionRef: baselineRef,
      creativityApplied,
      documentRef: SPACE_BUILDER_DOCUMENT_REF,
    };
  }

  const matchedPolicyRules = cite([promptEvaluation, outputEvaluation].filter((e): e is PolicyEvaluation => e !== null));

  if (!rules) {
    return {
      decision: 'HUMAN_REVIEW',
      space,
      reason: REASONS.UNAVAILABLE,
      matchedPolicyRules,
      policyVersionRef: baselineRef,
      creativityApplied,
      documentRef: SPACE_BUILDER_DOCUMENT_REF,
    };
  }

  const needsPerson =
    (promptEvaluation?.ambiguitySignals.length ?? 0) > 0 ||
    (promptEvaluation !== null && hasReviewRule(promptEvaluation)) ||
    (outputEvaluation !== null && hasReviewRule(outputEvaluation)) ||
    space.reviewNote.length > 0;

  return {
    decision: needsPerson ? 'HUMAN_REVIEW' : 'PUBLISH',
    space,
    reason: needsPerson ? REASONS.HUMAN_REVIEW : REASONS.PUBLISH,
    matchedPolicyRules,
    policyVersionRef: baselineRef,
    creativityApplied,
    documentRef: SPACE_BUILDER_DOCUMENT_REF,
  };
}
