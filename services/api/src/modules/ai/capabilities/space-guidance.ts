import {
  EXAMPLE_CARD_NOTICE,
  spaceCreationGuidanceSchema,
  type CreationDecision,
  type SpaceCreationGuidance,
} from '@taavon/contracts';
import type { AiOrchestrator } from '../orchestrator';
import { evaluatePolicy, policyVersionRef, type PolicyEvaluation, type PolicyRuleSource } from './policy-rules';

export interface SpaceProposal {
  title: string;
  purpose: string;
  participationMethods: string[];
  primaryRoleCount: number;
}

/**
 * The criteria the guidance is asked to reason about, recorded here so they
 * are versioned with the code rather than living only in a prompt string
 * somebody can quietly reword.
 *
 * They describe what makes a *cooperative undertaking* sound: clear benefit,
 * whether people can actually work together on it, whether it takes from
 * anyone, whether access is fair, whether it is stated plainly enough to
 * judge, whether what is entrusted is looked after, whether it treats people
 * with dignity, whether decisions are consulted on, whether someone answers
 * for it, and whether it can last.
 *
 * Every one is a property of the *proposal*. None is a property of the person
 * proposing it, which is the whole of "هیچ piety/person score".
 */
export const COOPERATION_CRITERIA = [
  'نفع روشن: این بستر چه نیاز مشخصی را برطرف می‌کند؟',
  'امکان تعاون: آیا چند نفر واقعاً می‌توانند روی آن با هم کار کنند؟',
  'عدم تعدی: آیا به کسی زیان می‌رساند یا چیزی از کسی می‌گیرد؟',
  'عدالت دسترسی: چه کسی می‌تواند مشارکت کند و چه کسی عملاً کنار می‌ماند؟',
  'تبیّن: آیا به‌قدر کافی روشن بیان شده که بتوان دربارهٔ آن قضاوت کرد؟',
  'امانت: آنچه به این بستر سپرده می‌شود چگونه نگهداری می‌شود؟',
  'کرامت: آیا با مشارکت‌کنندگان محترمانه رفتار می‌کند؟',
  'مشورت: تصمیم‌ها چگونه و با چه کسانی گرفته می‌شود؟',
  'پاسخ‌گویی: اگر چیزی اشتباه پیش برود، چه کسی پاسخ می‌دهد؟',
  'پایداری: آیا می‌تواند بیش از یک بار اتفاق بیفتد؟',
] as const;

/** A purpose shorter than this cannot be judged against the criteria above. */
const MIN_PURPOSE_LENGTH = 20;
const REQUIRED_PRIMARY_ROLES = 2;

export interface SpaceGuidanceDeps {
  orchestrator: AiOrchestrator;
  policy: PolicyRuleSource;
}

/**
 * Decides what happens to a proposal, from the policy evaluation and the
 * structural facts. The model has no vote.
 *
 * The order matters and is deliberate:
 *
 * 1. A SEVERE rule matched → BLOCK. This is the only path to a BLOCK, so a
 *    block always cites a term and a law.
 * 2. No rules at all → HUMAN_REVIEW. An unreadable baseline matches nothing,
 *    which would otherwise be indistinguishable from a clean proposal, and
 *    that is exactly the outage somebody would use to walk a blocked space
 *    through the gate.
 * 3. Anything ambiguous, or a REVIEW rule → HUMAN_REVIEW. Disagreement,
 *    satire and citation land here rather than in step 1, which is the
 *    point: they are not violations and must never be called one.
 * 4. Structurally incomplete → REVISE. Mechanical gaps, fixable by the person.
 * 5. Otherwise ALLOW.
 */
export function decide(evaluation: PolicyEvaluation, proposal: SpaceProposal): CreationDecision {
  if (evaluation.matched.some((m) => m.severity === 'SEVERE')) return 'BLOCK';
  if (evaluation.ruleCount === 0) return 'HUMAN_REVIEW';
  if (evaluation.ambiguitySignals.length > 0 || evaluation.matched.some((m) => m.severity === 'REVIEW')) {
    return 'HUMAN_REVIEW';
  }
  if (
    proposal.purpose.trim().length < MIN_PURPOSE_LENGTH ||
    proposal.participationMethods.length < 1 ||
    proposal.primaryRoleCount !== REQUIRED_PRIMARY_ROLES
  ) {
    return 'REVISE';
  }
  return 'ALLOW';
}

/**
 * The two roles a space needs before it can be published: someone who
 * coordinates and someone who takes part. Proposed, never imposed - the person
 * edits the wording or replaces them entirely.
 */
const PROPOSED_PRIMARY_ROLES: SpaceCreationGuidance['participationRoles'] = [
  { title: 'هماهنگ‌کننده', description: 'کارها را بین افراد تقسیم می‌کند و پیگیر می‌شود.', isPrimary: true },
  { title: 'مشارکت‌کننده', description: 'در انجام کار سهم می‌گیرد.', isPrimary: true },
];

/** The most common way people start, offered as a default rather than a blank. */
const DEFAULT_PARTICIPATION_METHOD = 'حضوری';

/**
 * What is structurally missing, each one written as a draft the person can
 * accept with one tap.
 *
 * The purpose draft keeps their own sentence as its opening and appends a
 * bracketed prompt for what is missing, so accepting it never replaces what
 * they wrote - it only gives them somewhere to keep typing.
 */
function structuralRevisions(proposal: SpaceProposal): SpaceCreationGuidance['suggestedRevisions'] {
  const revisions: SpaceCreationGuidance['suggestedRevisions'] = [];

  if (proposal.purpose.trim().length < MIN_PURPOSE_LENGTH) {
    const theirWords = proposal.purpose.trim() || proposal.title.trim();
    const prompt = '[چه کسی می‌تواند مشارکت کند و اولین قدم چیست؟ همین‌جا بنویسید.]';
    revisions.push({
      field: 'purpose',
      value: theirWords ? `${theirWords}\n\n${prompt}` : prompt,
      reason: `توضیح هدف را کامل‌تر بنویسید (حداقل ${MIN_PURPOSE_LENGTH} نویسه) تا بتوان دربارهٔ آن گفت‌وگو کرد.`,
    });
  }

  if (proposal.participationMethods.length < 1) {
    revisions.push({
      field: 'participationMethods',
      value: DEFAULT_PARTICIPATION_METHOD,
      reason: 'حداقل یک روش مشارکت مشخص کنید تا معلوم باشد کسی از کجا شروع کند. این پیشنهاد را می‌توانید تغییر دهید.',
    });
  }

  // A REVISE for missing roles has to point at something too, otherwise the
  // person is told to fix a gap they cannot see. The two proposed roles are
  // already in the output; this names them so accepting is one step.
  if (proposal.primaryRoleCount !== REQUIRED_PRIMARY_ROLES) {
    revisions.push({
      field: 'participationRoles',
      value: PROPOSED_PRIMARY_ROLES.map((role) => role.title).join('، '),
      reason: `برای انتشار، ${REQUIRED_PRIMARY_ROLES} نقش اصلی لازم است. این دو نقش پیشنهاد شده‌اند و قابل ویرایش‌اند.`,
    });
  }

  return revisions;
}

/**
 * The creative half, when the model is unavailable or was never configured.
 *
 * Rule-based and offline. It does not imitate a model: it turns the person's
 * own words into a starting structure and says plainly what it assumed. A
 * vague sentence still produces something editable rather than a demand for
 * a longer form - "AI باید ... خلاق و assumptions آشکار تولید کند، نه درخواست
 * فرم طولانی".
 */
function creativeFallback(proposal: SpaceProposal): Omit<
  SpaceCreationGuidance,
  'creationDecision' | 'matchedPolicyRules' | 'safetyLevel' | 'policyVersionRef'
> {
  const seed = proposal.purpose.trim() || proposal.title.trim();
  const firstLine = seed.split('\n')[0]?.trim() ?? seed;

  return {
    title: proposal.title.trim() || firstLine.slice(0, 80) || 'بستر تازه',
    // The person's own wording is kept rather than replaced. A description
    // they wrote is a better starting point than an invented one, and
    // replacing it would be exactly the silent mutation of intent this task
    // forbids. The fallbacks only apply when they wrote nothing at all, since
    // guidance for an empty submission is still better than an error.
    purpose: proposal.purpose.trim() || proposal.title.trim() || 'هنوز نوشته نشده است.',
    assumptions: [
      'فرض شد این بستر برای اهالی یک محله یا یک جمع محدود است، نه برای عموم شهر.',
      'فرض شد مشارکت داوطلبانه است و پولی رد و بدل نمی‌شود.',
    ],
    strengths: ['از یک نیاز واقعی شروع شده است.'],
    risks: ['هنوز روشن نیست چه کسی هماهنگی را بر عهده می‌گیرد.'],
    questions: [
      'چه کسی اولین قدم را برمی‌دارد؟',
      'اگر کسی نتوانست به قولش عمل کند، چه می‌شود؟',
      'این کار قرار است یک‌بار انجام شود یا ادامه پیدا کند؟',
    ],
    suggestedRevisions: structuralRevisions(proposal),
    participationRoles: [...PROPOSED_PRIMARY_ROLES],
    valueChainNodes: ['شناسایی نیاز', 'هماهنگی', 'انجام کار', 'بازخورد'],
    exampleCardTemplates: [
      {
        title: 'نمونه: اعلام آمادگی',
        body: 'من می‌توانم روزهای پنجشنبه کمک کنم. اگر کسی هماهنگی می‌کند خبر بدهد.',
        isExample: true,
        notice: EXAMPLE_CARD_NOTICE,
      },
    ],
    suggestedToolKeys: ['coordination', 'scheduling'],
  };
}

/**
 * Produces guidance for one proposed space.
 *
 * The creative content may come from a model; the decision never does. When
 * the model is unavailable, times out or returns something unusable, the
 * creative half falls back to rules and **the decision is unaffected** -
 * which is what makes an outage impossible to use as a way around the gate.
 */
export async function guideSpaceCreation(
  deps: SpaceGuidanceDeps,
  proposal: SpaceProposal,
  requesterId: string | null
): Promise<SpaceCreationGuidance> {
  const rules = await deps.policy.currentRules();
  const text = `${proposal.title}\n${proposal.purpose}\n${proposal.participationMethods.join(' ')}`;
  const evaluation = evaluatePolicy(text, rules);

  const creative = creativeFallback(proposal);

  // A blocked proposal is never sent to a model. There is nothing to draft
  // for something that may not exist, and sending it would spend budget on
  // producing content nobody may use.
  if (!evaluation.matched.some((m) => m.severity === 'SEVERE')) {
    try {
      const result = await deps.orchestrator.generate(
        {
          capability: 'SPACE_GUIDANCE',
          source: 'PUBLIC_USER_INPUT',
          text,
          provenance: { kind: 'USER_TYPED' },
        },
        requesterId
      );

      if (result.outcome === 'SUGGESTION' && result.output?.kind === 'SPACE_GUIDANCE') {
        // The model contributes framing, not structure: its headline becomes
        // a strength and its suggestions become questions. Nothing it returns
        // can change the decision, the matched rules or the person's own
        // title and purpose.
        creative.strengths = [result.output.headline, ...creative.strengths].slice(0, 10);
        creative.questions = [...result.output.suggestions, ...creative.questions].slice(0, 10);
      }
    } catch {
      // The orchestrator only throws on a policy refusal, which cannot happen
      // for USER_TYPED input. Anything unexpected still leaves the rule-based
      // guidance intact rather than failing the whole request.
    }
  }

  return spaceCreationGuidanceSchema.parse({
    ...creative,
    creationDecision: decide(evaluation, proposal),
    // Every matched rule, cited by key, version and the law behind it.
    matchedPolicyRules: evaluation.matched.map((m) => `${m.key}@v${m.version} — ${m.source}`),
    safetyLevel: evaluation.safetyLevel,
    policyVersionRef: policyVersionRef(rules),
  });
}
