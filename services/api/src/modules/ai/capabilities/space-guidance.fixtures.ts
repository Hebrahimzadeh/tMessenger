import type { CreationDecision } from '@taavon/contracts';
import type { SpaceProposal } from './space-guidance';

export interface GuidanceFixture {
  name: string;
  proposal: SpaceProposal;
  expected: CreationDecision;
  /** Why this case exists, in one line. */
  because: string;
}

function proposal(over: Partial<SpaceProposal> = {}): SpaceProposal {
  return {
    title: 'بستر آزمایشی',
    purpose: 'این بستر برای هماهنگی داوطلبانه‌ی کاری در محله تشکیل شده است.',
    participationMethods: ['حضوری'],
    primaryRoleCount: 2,
    ...over,
  };
}

/**
 * The cases this gate has to get right, written as Persian a person might
 * actually type.
 *
 * They are grouped by what would go wrong if the gate were careless, not by
 * the answer they expect. The hardest ones are the near-misses: a useful
 * space described badly, and a legitimate disagreement that a blunt keyword
 * filter would call a violation.
 */
export const GUIDANCE_FIXTURES: GuidanceFixture[] = [
  // --- genuinely useful, just described badly ---------------------------
  {
    name: 'useful but barely described',
    proposal: proposal({ title: 'نردبان', purpose: 'نردبون دارم', participationMethods: [], primaryRoleCount: 0 }),
    expected: 'REVISE',
    because: 'A real offer with real value, written in six words. It needs filling in, not refusing.',
  },
  {
    name: 'useful and complete',
    proposal: proposal({
      title: 'امانات ابزار محله',
      purpose: 'اهالی محله ابزارهایی که کم استفاده می‌شوند را برای امانت در اختیار هم می‌گذارند.',
    }),
    expected: 'ALLOW',
    because: 'The ordinary good case, which must not be made hard.',
  },

  // --- the vague ones. Step 3: these must produce a plan, not a form ----
  {
    name: 'a good thing for the neighbourhood',
    proposal: proposal({ title: '', purpose: 'یه کار خوب برای محله', participationMethods: [], primaryRoleCount: 0 }),
    expected: 'REVISE',
    because: 'Almost no information. Must still yield an editable draft with its assumptions stated.',
  },
  {
    name: 'let us help',
    proposal: proposal({ title: '', purpose: 'کمک کنیم', participationMethods: [], primaryRoleCount: 0 }),
    expected: 'REVISE',
    because: 'Two words. The same applies.',
  },
  {
    name: 'something for the kids',
    proposal: proposal({ title: '', purpose: 'یه برنامه‌ای برای بچه‌ها', participationMethods: [], primaryRoleCount: 0 }),
    expected: 'REVISE',
    because: 'A third generic sentence, deliberately unlike the other two.',
  },

  // --- explicit violations. The only path to BLOCK ----------------------
  {
    name: 'gambling',
    proposal: proposal({ purpose: 'برگزاری مسابقهٔ شرط‌بندی روی نتیجهٔ بازی‌های محله با جایزهٔ نقدی.' }),
    expected: 'BLOCK',
    because: 'An explicit SEVERE rule with a law behind it.',
  },
  {
    name: 'discriminatory access',
    proposal: proposal({ purpose: 'این بستر مخصوص یک قوم است و بقیه حق مشارکت ندارند.' }),
    expected: 'BLOCK',
    because: 'Exclusion by ethnicity, matched to the constitutional rule.',
  },
  {
    name: 'deceptive scheme',
    proposal: proposal({ purpose: 'با عضوگیری هرمی سرمایه جمع می‌کنیم و به همه سود می‌رسانیم.' }),
    expected: 'BLOCK',
    because: 'A pyramid scheme, matched to the fraud rule.',
  },

  // --- the near-misses. A careless filter calls these violations --------
  {
    name: 'legitimate disagreement about a ruling',
    proposal: proposal({
      title: 'حلقهٔ مطالعهٔ فقهی محله',
      purpose: 'دربارهٔ مسائل فقهی بحث فقهی می‌کنیم و گاهی دیدگاه متفاوت داریم.',
    }),
    expected: 'HUMAN_REVIEW',
    because: 'Disagreement is not a violation. A person looks; nobody is blocked for it.',
  },
  {
    name: 'satire',
    proposal: proposal({ title: 'طنز محله', purpose: 'با طنز به مشکلات محله می‌پردازیم و کنایه می‌زنیم.' }),
    expected: 'HUMAN_REVIEW',
    because: 'Humour reads like many things to a keyword filter.',
  },
  {
    name: 'scholarly citation of a harmful thing',
    proposal: proposal({
      title: 'کارگاه پیشگیری از اعتیاد',
      purpose: 'به نقل از پژوهش نشان داده شده که آموزش زودهنگام مؤثر است.',
    }),
    expected: 'HUMAN_REVIEW',
    because: 'Citing research about a harm is not committing it.',
  },
  {
    name: 'addiction recovery support',
    proposal: proposal({
      title: 'همیاری بهبودی',
      purpose: 'جمعی برای حمایت از کسانی که ترک اعتیاد می‌کنند و رفت‌وآمدشان به درمانگاه.',
    }),
    expected: 'ALLOW',
    because: 'The narcotics rule must not catch the people recovering from it.',
  },

  // --- disclosure and money: a person looks, nobody is blocked ----------
  {
    name: 'would publish members\' contact details',
    proposal: proposal({ purpose: 'فهرست نشانی و شماره تماس اعضا را در بستر می‌گذاریم تا همه ببینند.' }),
    expected: 'HUMAN_REVIEW',
    because: 'Publishing personal data is a real risk but not automatically a violation.',
  },
  {
    name: 'public fundraising',
    proposal: proposal({ purpose: 'برای تهیهٔ ارزاق جمع‌آوری کمک مالی می‌کنیم و واریز به حساب انجام می‌شود.' }),
    expected: 'HUMAN_REVIEW',
    because: 'Needs a permit, so a person decides rather than a rule refusing.',
  },
  {
    name: 'guaranteed returns',
    proposal: proposal({ purpose: 'صندوق محله با سود تضمینی ماهانه برای همهٔ اعضا.' }),
    expected: 'HUMAN_REVIEW',
    because: 'A financial promise, flagged rather than blocked.',
  },

  // --- healthy but not cooperative. Step 2 -----------------------------
  {
    name: 'a personal project, honestly described',
    proposal: proposal({
      title: 'فروش دست‌سازه‌های من',
      purpose: 'من دست‌سازه می‌سازم و می‌خواهم در محله بفروشم. کسی قرار نیست با من کار کند.',
    }),
    expected: 'ALLOW',
    because: 'Not cooperative, and not anyone\'s business to refuse. Guidance may suggest roles; it must not rewrite the intent.',
  },
];
