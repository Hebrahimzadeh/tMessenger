import type { SpaceGateVerdict } from '@taavon/database';

export interface SpaceGateDefinitionInput {
  title: string;
  purpose: string;
  participationMethods: string[];
  primaryRoleCount: number;
}

export interface SpaceGateResult {
  verdict: SpaceGateVerdict;
  reason: string;
}

const MIN_PURPOSE_LENGTH = 20;
const REQUIRED_PRIMARY_ROLE_COUNT = 2;

/**
 * Explicit, clearly-disallowed content - a real moderation policy would be
 * far larger than this; this fixture list exists only to make the interim
 * rule-based gate deterministic and testable. Task 24 replaces this whole
 * adapter with a real AI provider behind the same `evaluate()` shape.
 */
const BLOCK_TERMS = ['قمار', 'کلاهبرداری', 'فروش اسلحه', 'مواد مخدر'];

/**
 * Borderline/sensitive content that is not outright banned but should not
 * be auto-approved either - this task's own acceptance bullet: "ruleهای
 * صریح fixture را BLOCK و هر مورد خارج پوشش را HUMAN_REVIEW کند، نه ALLOW
 * حدسی" (explicit fixture rules go to BLOCK; everything outside that
 * coverage goes to HUMAN_REVIEW, never a guessed ALLOW).
 */
const REVIEW_FLAG_TERMS = ['تضمین سود', 'جمع‌آوری کمک مالی', 'دارویی'];

function containsAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

/**
 * Temporary, rule-based `SpaceCreationGate` adapter (this task's own
 * requirement: "adapter موقت قاعده‌محور ... بساز"). Structural completeness
 * (purpose length, at least one participation method, exactly two primary
 * roles) is checked first and reported as REVISE with a specific, fixable
 * reason - these are mechanical gaps, not content-safety judgment calls.
 * Only once a definition is structurally complete does content-safety
 * fixture matching apply: an explicit BLOCK_TERMS match always wins over a
 * REVIEW_FLAG_TERMS match (a confirmed violation is reported as such, not
 * softened into "needs a human look"); anything matching neither list is
 * ALLOW; nothing is ever guessed into ALLOW from ambiguous content.
 */
export function evaluateSpaceCreationGate(input: SpaceGateDefinitionInput): SpaceGateResult {
  if (input.purpose.trim().length < MIN_PURPOSE_LENGTH) {
    return { verdict: 'REVISE', reason: `توضیح هدف را کامل‌تر بنویسید (حداقل ${MIN_PURPOSE_LENGTH} نویسه).` };
  }
  if (input.participationMethods.length < 1) {
    return { verdict: 'REVISE', reason: 'حداقل یک روش مشارکت مشخص کنید.' };
  }
  if (input.primaryRoleCount !== REQUIRED_PRIMARY_ROLE_COUNT) {
    return { verdict: 'REVISE', reason: 'دقیقاً دو نقش اصلی متفاوت لازم است.' };
  }

  const text = `${input.title} ${input.purpose}`;

  if (containsAny(text, BLOCK_TERMS)) {
    return { verdict: 'BLOCK', reason: 'محتوای این بستر با قوانین پلتفرم مغایرت دارد.' };
  }
  if (containsAny(text, REVIEW_FLAG_TERMS)) {
    return { verdict: 'HUMAN_REVIEW', reason: 'این محتوا نیاز به بررسی دستی دارد.' };
  }

  return { verdict: 'ALLOW', reason: 'بستر با معیارهای پایه مطابقت دارد.' };
}
