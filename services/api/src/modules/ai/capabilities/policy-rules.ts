import type { SafetyLevel } from '@taavon/contracts';

export interface PolicyRule {
  key: string;
  version: number;
  title: string;
  source: string;
  example: string;
  severity: SafetyLevel;
  matchTerms: string[];
}

export interface MatchedRule {
  key: string;
  version: number;
  title: string;
  source: string;
  severity: SafetyLevel;
  /** The exact term that matched, so a decision can be explained precisely. */
  matchedTerm: string;
}

export interface PolicyRuleSource {
  /** The current version of every baseline rule. Immutable, seeded by migration. */
  currentRules(): Promise<PolicyRule[]>;
}

/**
 * Signals that something needs a person rather than a rule.
 *
 * This list is the counterweight to the block rules, and it exists because
 * the failure everybody worries about with automated moderation is not
 * missing a violation - it is calling something a violation when it is
 * criticism, a joke, a citation, or a disagreement people are entitled to
 * have. So these do not soften a matched rule; they *raise* an otherwise
 * clean proposal to a human, which costs a delay and never costs someone
 * their space.
 */
const AMBIGUITY_SIGNALS: { key: string; terms: string[] }[] = [
  {
    // "این حکم درست نیست", "با این فتوا موافق نیستم" - a disagreement about a
    // ruling is not a violation of it. Explicitly never a BLOCK: step 4 of
    // this task exists because that mistake is the easy one to make.
    key: 'legitimate_disagreement',
    terms: ['اختلاف نظر', 'مخالفم', 'نقد می‌کنیم', 'نقد کنیم', 'بحث فقهی', 'دیدگاه متفاوت'],
  },
  {
    key: 'satire_or_humour',
    terms: ['طنز', 'شوخی', 'کنایه'],
  },
  {
    key: 'scholarly_citation',
    terms: ['به نقل از', 'پژوهش نشان', 'مطالعهٔ علمی', 'منبع علمی', 'طبق تحقیق'],
  },
  {
    key: 'possible_personal_data',
    terms: ['شماره تماس اعضا', 'فهرست نشانی', 'کد ملی'],
  },
];

export interface PolicyEvaluation {
  matched: MatchedRule[];
  /** Why a person is needed, when they are. Empty on a clean proposal. */
  ambiguitySignals: string[];
  safetyLevel: SafetyLevel;
  /**
   * How many rules were actually consulted.
   *
   * Zero means the baseline could not be read, not that the proposal is
   * clean, and the decision has to tell those two apart: an empty rule table
   * matches nothing, which would otherwise read as a spotless ALLOW.
   */
  ruleCount: number;
}

function findTerm(text: string, terms: string[]): string | null {
  return terms.find((term) => text.includes(term)) ?? null;
}

/**
 * Matches a proposal against the baseline. Deterministic and offline: the
 * model has no part in this.
 *
 * That separation is the whole architecture of Task 24. A model is good at
 * the creative half - drafting a purpose, proposing roles, imagining example
 * cards - and is exactly the wrong thing to trust with "may this exist". So
 * the decision comes from rules a person wrote, seeded by a reviewed
 * migration, and every BLOCK can be explained by pointing at the term that
 * matched and the law it cites.
 */
export function evaluatePolicy(text: string, rules: PolicyRule[]): PolicyEvaluation {
  const matched: MatchedRule[] = [];

  for (const rule of rules) {
    const matchedTerm = findTerm(text, rule.matchTerms);
    if (!matchedTerm) continue;
    matched.push({
      key: rule.key,
      version: rule.version,
      title: rule.title,
      source: rule.source,
      severity: rule.severity,
      matchedTerm,
    });
  }

  const ambiguitySignals = AMBIGUITY_SIGNALS.filter((signal) => findTerm(text, signal.terms) !== null).map(
    (signal) => signal.key
  );

  const safetyLevel: SafetyLevel = matched.some((m) => m.severity === 'SEVERE')
    ? 'SEVERE'
    : matched.some((m) => m.severity === 'REVIEW') || ambiguitySignals.length > 0
      ? 'REVIEW'
      : 'NORMAL';

  return { matched, ambiguitySignals, safetyLevel, ruleCount: rules.length };
}

/** A stable, human-readable citation of which baseline produced a decision. */
export function policyVersionRef(rules: PolicyRule[]): string {
  if (rules.length === 0) return 'baseline:none';
  const highest = Math.max(...rules.map((r) => r.version));
  return `baseline:v${highest}:${rules.length}rules`;
}
