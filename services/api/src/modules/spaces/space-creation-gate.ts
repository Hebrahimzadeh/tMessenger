import type { SpaceGateVerdict } from '@taavon/database';
import type { CreationDecision, SpaceCreationGuidance } from '@taavon/contracts';
import { decide, guideSpaceCreation, type SpaceGuidanceDeps } from '../ai/capabilities/space-guidance';
import { evaluatePolicy, policyVersionRef, type PolicyRuleSource } from '../ai/capabilities/policy-rules';

export interface SpaceGateDefinitionInput {
  title: string;
  purpose: string;
  participationMethods: string[];
  primaryRoleCount: number;
}

export interface SpaceGateResult {
  verdict: SpaceGateVerdict;
  reason: string;
  /** Which baseline produced this verdict, so it stays traceable after the rules change. */
  policyVersionRef: string;
  /** The rules that actually matched, cited by key, version and the law behind them. */
  matchedPolicyRules: string[];
  /** The creative half. Null when the gate failed closed and there is nothing to show. */
  guidance: SpaceCreationGuidance | null;
}

/**
 * The port Task 10 defined and this task finally fills. The service depends
 * on this shape, not on the guidance module, so a future provider change is
 * one adapter rather than a rewrite of the space pipeline.
 */
/** A definition checked by rules alone, as an edit to a published space is. */
export interface SpaceGateCheckInput extends SpaceGateDefinitionInput {
  /** Everything else a visitor will read (audience, roles, sample cards), checked against the rules too. */
  publicText?: string;
  /**
   * The text whose ambiguity signals count. Defaults to all of it.
   *
   * An edit passes only what the person actually changed: a published
   * description the model wrote may mention "respectful disagreement", and
   * holding back a title fix because of wording nobody touched would make a
   * space uneditable for doing its job.
   */
  ambiguityText?: string;
}

export interface SpaceCreationGate {
  evaluate(input: SpaceGateDefinitionInput): Promise<SpaceGateResult>;
  /**
   * The verdict from the policy baseline alone - no model is asked anything.
   * Same fail-closed behaviour as `evaluate`: an unreadable, empty or hanging
   * baseline is HUMAN_REVIEW, never ALLOW.
   */
  check(input: SpaceGateCheckInput): Promise<SpaceGateResult>;
  /**
   * The cheap check made before a slug is claimed, against nothing but a
   * title. Answers only "does this obviously violate a SEVERE rule", because
   * that is all a title can tell you.
   */
  blocksOnTitle(title: string): Promise<boolean>;
}

/** How long the gate waits on the policy baseline before failing closed. */
export const GATE_TIMEOUT_MS = 5_000;

export interface SpaceCreationGateOptions {
  timeoutMs?: number;
  /**
   * Called with whatever made the gate fail closed.
   *
   * Failing closed is the right behaviour and it is also invisible: every
   * proposal simply becomes a HUMAN_REVIEW, which looks like a busy queue
   * rather than a broken dependency. Without this hook the cause never
   * leaves the process, so the one thing an operator needs is the one thing
   * they cannot get.
   */
  onFailure?: (error: unknown) => void;
}

const REASONS: Record<CreationDecision, string> = {
  ALLOW: 'بستر با معیارهای پایه مطابقت دارد.',
  REVISE: 'برای ادامه، چند مورد را کامل کنید.',
  HUMAN_REVIEW: 'این درخواست را یک نفر بررسی می‌کند. چیزی رد نشده است.',
  BLOCK: 'این درخواست با یک قاعدهٔ صریح مغایرت دارد.',
};

/**
 * What the gate answers when it could not reach a decision.
 *
 * HUMAN_REVIEW rather than BLOCK, and rather than ALLOW, and the difference
 * matters in both directions: blocking on an outage punishes people for an
 * infrastructure fault, while allowing on one turns every outage into a way
 * around the gate. A person looking costs a delay and nothing else.
 */
function failClosed(): SpaceGateResult {
  return {
    verdict: 'HUMAN_REVIEW',
    reason: 'بررسی خودکار در دسترس نبود، بنابراین یک نفر این درخواست را بررسی می‌کند.',
    policyVersionRef: 'unavailable',
    matchedPolicyRules: [],
    guidance: null,
  };
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('GATE_TIMEOUT')), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    );
  });
}

/**
 * The decision-to-verdict mapping. One-to-one and total, because the two
 * enums describe the same four outcomes from different sides: the guidance
 * says what should happen to a proposal, the space pipeline records what
 * happened to a version.
 */
const VERDICT_BY_DECISION: Record<CreationDecision, SpaceGateVerdict> = {
  ALLOW: 'ALLOW',
  REVISE: 'REVISE',
  HUMAN_REVIEW: 'HUMAN_REVIEW',
  BLOCK: 'BLOCK',
};

/**
 * The real gate: deterministic policy rules for the verdict, and a model -
 * when one is configured and reachable - for the creative half only.
 *
 * Every failure path lands in `failClosed`. That includes the ones that look
 * like success: an empty baseline matches nothing, and `decide` treats a rule
 * count of zero as an outage rather than a clean proposal, so a policy table
 * that failed to seed cannot quietly approve everything.
 */
export function createSpaceCreationGate(deps: SpaceGuidanceDeps, options: SpaceCreationGateOptions = {}): SpaceCreationGate {
  const timeoutMs = options.timeoutMs ?? GATE_TIMEOUT_MS;
  const report = options.onFailure ?? (() => {});

  return {
    async evaluate(input) {
      let guidance: SpaceCreationGuidance;
      try {
        guidance = await withTimeout(guideSpaceCreation(deps, input, null), timeoutMs);
      } catch (error) {
        report(error);
        return failClosed();
      }

      return {
        verdict: VERDICT_BY_DECISION[guidance.creationDecision],
        reason: REASONS[guidance.creationDecision],
        policyVersionRef: guidance.policyVersionRef,
        matchedPolicyRules: guidance.matchedPolicyRules,
        guidance,
      };
    },

    async check(input) {
      let rules;
      try {
        rules = await withTimeout(deps.policy.currentRules(), timeoutMs);
      } catch (error) {
        report(error);
        return failClosed();
      }

      const fullText = [input.title, input.purpose, ...input.participationMethods, input.publicText ?? ''].join('\n');
      const evaluation = evaluatePolicy(fullText, rules);
      const ambiguitySignals =
        input.ambiguityText === undefined ? evaluation.ambiguitySignals : evaluatePolicy(input.ambiguityText, rules).ambiguitySignals;

      const decision = decide({ ...evaluation, ambiguitySignals }, input);
      return {
        verdict: VERDICT_BY_DECISION[decision],
        reason: REASONS[decision],
        policyVersionRef: rules.length > 0 ? policyVersionRef(rules) : 'unavailable',
        matchedPolicyRules: evaluation.matched.map((m) => `${m.key}@v${m.version} — ${m.source}`),
        guidance: null,
      };
    },

    async blocksOnTitle(title) {
      try {
        const rules = await withTimeout(deps.policy.currentRules(), timeoutMs);
        // An unreadable baseline must not refuse a title either. Creating a
        // draft nobody else can see is not the dangerous step; publishing is,
        // and `evaluate` guards that one.
        if (rules.length === 0) return false;
        return evaluatePolicy(title, rules).matched.some((m) => m.severity === 'SEVERE');
      } catch (error) {
        report(error);
        return false;
      }
    },
  };
}

export { policyVersionRef };
export type { PolicyRuleSource, SpaceGuidanceDeps };
