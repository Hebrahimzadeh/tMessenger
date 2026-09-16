import type { PolicyRule, PolicyRuleSource } from './policy-rules';
import { AiOrchestrator, type OrchestratorRepository } from '../orchestrator';
import type { AiProvider } from '../providers/ai-provider';
import {
  createSpaceCreationGate,
  type SpaceCreationGate,
  type SpaceCreationGateOptions,
} from '../../spaces/space-creation-gate';

/**
 * The baseline exactly as `20260916090000_policy_baseline` seeds it, as data
 * a unit test can hold.
 *
 * Kept in one place so the rules a test reasons about and the rules the gate
 * reasons about cannot drift apart silently. `policy.repository.test.ts`
 * compares this against what is actually in the database, which is the only
 * thing that makes the claim true rather than merely intended.
 */
export const BASELINE_FIXTURE: PolicyRule[] = [
  {
    key: 'gambling',
    version: 1,
    title: 'سازمان‌دهی قمار و شرط‌بندی',
    source: 'قانون مجازات اسلامی، مواد ۷۰۵ تا ۷۱۱',
    example: 'بستری برای گرداندن مسابقهٔ شرط‌بندی روی نتیجهٔ بازی‌ها. شامل بازی رومیزی بدون شرط‌بندی نمی‌شود.',
    severity: 'SEVERE',
    matchTerms: ['قمار', 'شرط‌بندی', 'شرط بندی'],
  },
  {
    key: 'fraud',
    version: 1,
    title: 'کلاهبرداری و تحصیل مال از راه نامشروع',
    source: 'قانون تشدید مجازات مرتکبین ارتشا، اختلاس و کلاهبرداری، مادهٔ ۱',
    example: 'بستری که با وعدهٔ دروغ سرمایه جمع می‌کند. شامل انتقاد از یک کسب‌وکار نمی‌شود.',
    severity: 'SEVERE',
    matchTerms: ['کلاهبرداری', 'پانزی', 'هرمی'],
  },
  {
    key: 'weapons_trade',
    version: 1,
    title: 'خرید و فروش سلاح',
    source: 'قانون مجازات قاچاق اسلحه و مهمات، مادهٔ ۲',
    example: 'بستری برای واسطه‌گری فروش سلاح گرم. شامل گفت‌وگو دربارهٔ ایمنی شکار نمی‌شود.',
    severity: 'SEVERE',
    matchTerms: ['فروش اسلحه', 'خرید اسلحه', 'سلاح گرم'],
  },
  {
    key: 'narcotics',
    version: 1,
    title: 'مواد مخدر و روان‌گردان',
    source: 'قانون مبارزه با مواد مخدر، مادهٔ ۴',
    example: 'بستری برای تهیه یا توزیع مواد مخدر. شامل بستر ترک اعتیاد و حمایت از بهبودی نمی‌شود.',
    severity: 'SEVERE',
    matchTerms: ['مواد مخدر', 'توزیع مواد'],
  },
  {
    key: 'discrimination',
    version: 1,
    title: 'محروم‌کردن بر پایهٔ قومیت، مذهب، جنسیت یا معلولیت',
    source: 'قانون اساسی جمهوری اسلامی ایران، اصل نوزدهم',
    example:
      'بستری که مشارکت را برای یک قومیت ممنوع می‌کند. شامل بستری که ویژهٔ یک گروه تشکیل شده ولی کسی را محروم نمی‌کند، نمی‌شود.',
    severity: 'SEVERE',
    matchTerms: ['فقط برای فارس‌ها', 'ورود اقلیت ممنوع', 'مخصوص یک قوم'],
  },
  {
    key: 'guaranteed_return',
    version: 1,
    title: 'وعدهٔ سود تضمین‌شده',
    source: 'سیاست پلتفرم: هیچ بستری نباید بازده مالی تضمین کند',
    example: 'بستری که «سود ماهانه تضمینی» تبلیغ می‌کند. یک صندوق قرض‌الحسنهٔ شفاف بدون وعدهٔ بازده مشمول نیست.',
    severity: 'REVIEW',
    matchTerms: ['تضمین سود', 'سود تضمینی', 'بازده تضمین'],
  },
  {
    key: 'public_fundraising',
    version: 1,
    title: 'جمع‌آوری کمک مالی عمومی',
    source: 'قانون نحوهٔ فعالیت مؤسسات خیریه؛ نیازمند مجوز',
    example: 'بستری که از عموم پول جمع می‌کند. هماهنگی کمک غیرنقدی مانند ارزاق مشمول بررسی سبک‌تری است.',
    severity: 'REVIEW',
    matchTerms: ['جمع‌آوری کمک مالی', 'جمع آوری پول', 'واریز به حساب'],
  },
  {
    key: 'medical_claim',
    version: 1,
    title: 'ادعای درمانی و دارویی',
    source: 'قانون مربوط به مقررات امور پزشکی و دارویی، مادهٔ ۳',
    example: 'بستری که «درمان قطعی» ارائه می‌دهد. بستر همیاری بیماران برای رفت‌وآمد به درمانگاه مشمول نیست.',
    severity: 'REVIEW',
    matchTerms: ['درمان قطعی', 'دارویی', 'شفای قطعی'],
  },
];

export const fixturePolicySource: PolicyRuleSource = {
  currentRules: async () => BASELINE_FIXTURE,
};

/** A rule source that is down, for the paths that must fail closed. */
export const brokenPolicySource: PolicyRuleSource = {
  currentRules: async () => {
    throw new Error('policy baseline unreachable');
  },
};

/** A rule source that answers, but with nothing - a baseline that failed to seed. */
export const emptyPolicySource: PolicyRuleSource = {
  currentRules: async () => [],
};

/** A repository that records nothing, for tests that care only about the decision. */
export function noopOrchestratorRepository(): OrchestratorRepository {
  return {
    async createRequest() {
      return { id: '00000000-0000-4000-8000-000000000001' };
    },
    async recordResult() {},
    async recordUsage() {},
    async countRecentRequests() {
      return 0;
    },
    async spentTodayMicros() {
      return 0;
    },
    async currentPromptVersion() {
      return null;
    },
    conversationKind: { kindOf: async () => null },
  };
}

/**
 * A gate with no model behind it, over the baseline fixture.
 *
 * This is the configuration every decision test should use, because the
 * decision is supposed to be identical with and without a provider. A test
 * that needs the creative half passes one.
 */
export function fixtureGate(
  policy: PolicyRuleSource = fixturePolicySource,
  provider: AiProvider | null = null,
  options: SpaceCreationGateOptions = {}
): SpaceCreationGate {
  return createSpaceCreationGate(
    {
      orchestrator: new AiOrchestrator({
        provider,
        repository: noopOrchestratorRepository(),
        dailyBudgetMicros: null,
      }),
      policy,
    },
    options
  );
}
