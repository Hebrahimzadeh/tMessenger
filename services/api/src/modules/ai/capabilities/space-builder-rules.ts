import { spaceBuildOutputSchema, type SpaceBuildOutput } from '@taavon/contracts';

/**
 * A whole space from one prompt, with no model.
 *
 * This is what runs whenever the model is off, unreachable, slow or wrong, so
 * it has to meet the same bar the model does: a complete space that can be
 * published as it stands, and a description written *about the space* rather
 * than the person's words pasted back at them.
 *
 * It does not pretend to be creative. It recognises a handful of common kinds
 * of undertaking, uses the platform's own vocabulary for them (the two-sided
 * roles in architecture §6.7 - "دارندهٔ ابزار و نیازمند ابزار", "مربی و
 * یادگیرنده"), and says only what is true of every space here: that people
 * post cards and coordinate underneath them. It never invents a number, a
 * place, an organisation or a promise.
 */

interface Theme {
  terms: readonly string[];
  /** Used as the title when the prompt leaves nothing noun-like behind ("کمک کنیم"). */
  title: string;
  /** What the space is for, as the end of "بستری است برای ...". */
  purpose: string;
  primary: [{ title: string; description: string }, { title: string; description: string }];
  firstMethod: string;
  hint: { title: string; description: string };
}

/** Most specific first: a lending with a class attached is still a lending. */
const THEMES: readonly Theme[] = [
  {
    terms: ['قرض', 'امانت', 'عاریه', 'نردبان', 'نردبون', 'دریل', 'وسایل', 'وسیله', 'ابزار'],
    title: 'امانت وسایل',
    purpose: 'امانت‌دادن و امانت‌گرفتن وسایلی که کم استفاده می‌شوند',
    primary: [
      { title: 'دارندهٔ وسیله', description: 'وسیله‌ای را که کم استفاده می‌کند برای امانت در اختیار دیگران می‌گذارد.' },
      { title: 'نیازمند وسیله', description: 'وسیله‌ای را برای مدت کوتاه امانت می‌گیرد و سالم برمی‌گرداند.' },
    ],
    firstMethod: 'ثبت کارت وسیلهٔ قابل امانت',
    hint: { title: 'وسیلهٔ آماده برای امانت', description: 'نام وسیله، مدت امانت و زمان مناسب تحویل را بنویسید.' },
  },
  {
    terms: ['آموزش', 'کلاس', 'درس', 'تدریس', 'مربی', 'یادگیری', 'کارگاه', 'مهارت'],
    title: 'آموزش و یادگیری',
    purpose: 'به اشتراک گذاشتن دانش و مهارت و یادگیری از یکدیگر',
    primary: [
      { title: 'آموزش‌دهنده', description: 'دانسته یا مهارتی را به دیگران آموزش می‌دهد.' },
      { title: 'یادگیرنده', description: 'برای آموختن یک دانش یا مهارت همراه می‌شود.' },
    ],
    firstMethod: 'ثبت کارت پیشنهاد آموزش یا درخواست یادگیری',
    hint: { title: 'پیشنهاد یک جلسهٔ آموزشی', description: 'موضوع، سطح مناسب و زمان پیشنهادی را بنویسید.' },
  },
  {
    terms: ['تعمیر', 'خدمات', 'خدمت', 'نظافت', 'باغبانی', 'جابه‌جایی'],
    title: 'خدمات مردمی',
    purpose: 'ارائه و درخواست خدمت‌های کوچک میان مردم',
    primary: [
      { title: 'ارائه‌دهندهٔ خدمت', description: 'کاری را که از دستش برمی‌آید برای دیگران انجام می‌دهد.' },
      { title: 'متقاضی خدمت', description: 'برای انجام کاری که به آن نیاز دارد کمک می‌خواهد.' },
    ],
    firstMethod: 'ثبت کارت خدمت یا درخواست خدمت',
    hint: { title: 'خدمتی که می‌توانم انجام دهم', description: 'نوع کار، زمان‌های در دسترس و محدوده را بنویسید.' },
  },
  {
    terms: ['کمک', 'یاری', 'نیازمند', 'خیریه', 'ارزاق', 'جهیزیه', 'بیمار', 'سالمند'],
    title: 'یاری‌رسانی',
    purpose: 'رساندن یاری به کسانی که به آن نیاز دارند',
    primary: [
      { title: 'یاری‌رسان', description: 'آنچه در توان دارد برای یاری دیگران پیشنهاد می‌کند.' },
      { title: 'نیازمند یاری', description: 'نیازی را که دارد با حفظ حریم و کرامتش مطرح می‌کند.' },
    ],
    firstMethod: 'ثبت کارت پیشنهاد یاری یا اعلام نیاز',
    hint: { title: 'پیشنهاد یاری', description: 'نوع کمکی که از شما برمی‌آید و زمان آن را بنویسید؛ اطلاعات خصوصی افراد را ننویسید.' },
  },
  {
    terms: ['بچه', 'کودک', 'نوجوان', 'خانواده'],
    title: 'برنامه برای کودکان',
    purpose: 'برنامه‌ریزی و برگزاری فعالیت‌های سالم برای کودکان و نوجوانان',
    primary: [
      { title: 'برگزارکنندهٔ برنامه', description: 'فعالیتی برای کودکان یا نوجوانان پیشنهاد و هماهنگ می‌کند.' },
      { title: 'خانوادهٔ همراه', description: 'با فرزندانش در برنامه شرکت می‌کند یا در برگزاری کمک می‌کند.' },
    ],
    firstMethod: 'ثبت کارت پیشنهاد برنامه',
    hint: { title: 'پیشنهاد یک برنامه', description: 'نوع فعالیت، گروه سنی مناسب و زمان پیشنهادی را بنویسید.' },
  },
];

const DEFAULT_THEME: Theme = {
  terms: [],
  title: 'همکاری برای کار خیر',
  purpose: 'همکاری مردم در یک کار مشترک و خیر',
  primary: [
    { title: 'پیشنهاددهنده', description: 'کاری مفید را پیشنهاد می‌دهد و آغاز می‌کند.' },
    { title: 'همراه', description: 'در انجام کار مشارکت می‌کند و سهمی بر عهده می‌گیرد.' },
  ],
  firstMethod: 'ثبت کارت پیشنهاد یا اعلام آمادگی',
  hint: { title: 'اعلام آمادگی برای همکاری', description: 'بنویسید چه کاری از شما برمی‌آید و چه زمانی در دسترس هستید.' },
};

const COORDINATOR = {
  title: 'هماهنگ‌کننده',
  description: 'به هماهنگی میان مشارکت‌کنندگان و پیگیری کارها کمک می‌کند.',
  isPrimary: false,
};

/** Phrases that say someone wants something, not what they want. */
const LEADING_FILLER = [
  // \u200c is the zero-width non-joiner in «می‌خوام»; written as an escape so
  // nobody has to guess whether an invisible character is in the class.
  /^(من\s+)?(می[\u200c\s]?خوا(ه)?م|می[\u200c\s]?خواهیم|می[\u200c\s]?خوایم)\s+/,
  /^(لطفاً|لطفا)\s+/,
  /^(یه|یک)\s+/,
  /^(بستر|بستری|زیربستر|گروه|فضا|فضایی|جایی|جای)\s+(برای|که)\s+/,
];
const TRAILING_FILLER = /\s+(بسازم|بسازیم|درست\s+کنم|درست\s+کنیم|راه\s+بندازم|راه\s+بیندازم|ایجاد\s+کنم|داشته\s+باشیم|داشته\s+باشم|کنیم|کنم)$/;

/** Below this, what survived the cleanup is a word, not a name ("کمک"). */
const MIN_TOPIC_TITLE_LENGTH = 8;
/** Above this it is a sentence, not a name. */
const MAX_TOPIC_TITLE_LENGTH = 45;

/**
 * First-person and verb forms: "من یه نردبون دارم می‌خوام قرض بدم" is how
 * people actually write, and it is a sentence about the writer, not the name
 * of a space. Without this check that exact sentence became the title and the
 * opening of the description - the person's words pasted back at them.
 */
const PERSONAL_OR_VERBAL = /(^|\s)(من|ما|دارم|داریم|می[\u200c\s]?خوا\S*|بدم|بدیم|کنم|کنیم|هستم|هستیم|بسازم|بذارم|بگذارم|برم|بریم)(\s|$)/;

/** Whether what survived the cleanup can stand as the name of a space. */
function isNameLike(topic: string): boolean {
  return topic.length >= MIN_TOPIC_TITLE_LENGTH && topic.length <= MAX_TOPIC_TITLE_LENGTH && !PERSONAL_OR_VERBAL.test(topic);
}

function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function firstClause(text: string): string {
  return normalise(text).split(/[.!?؟\n]/)[0]?.trim() ?? '';
}

/** Removes "I want a ... for" and friends, leaving the thing itself. */
export function topicOf(prompt: string): string {
  let topic = firstClause(prompt);
  for (let i = 0; i < 3; i += 1) {
    for (const pattern of LEADING_FILLER) topic = topic.replace(pattern, '');
  }
  topic = topic.replace(TRAILING_FILLER, '').replace(/[«»"'،,:؛]+$/g, '').trim();
  return topic;
}

function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trim();
}

function themeFor(prompt: string): Theme {
  return THEMES.find((theme) => theme.terms.some((term) => prompt.includes(term))) ?? DEFAULT_THEME;
}

function audienceFor(prompt: string): string {
  if (/محله|همسایه/.test(prompt)) return 'اهالی محله و همسایه‌ها';
  if (/بچه|کودک|نوجوان/.test(prompt)) return 'خانواده‌ها، کودکان و نوجوانان';
  if (/دانشگاه|دانشجو/.test(prompt)) return 'دانشجویان';
  if (/مسجد|هیئت|هیأت/.test(prompt)) return 'اهالی و هم‌مسجدی‌ها';
  return '';
}

function titleFor(topic: string, theme: Theme): string {
  // When nothing name-like survived ("کمک کنیم" leaves "کمک"; a first-person
  // sentence is not a name at all), use what the space is for instead.
  return isNameLike(topic) ? topic : theme.title;
}

/**
 * Builds the description as a statement about the space, in the third
 * person, for a visitor - never "من" and never the prompt verbatim.
 */
function descriptionFor(title: string, theme: Theme, audience: string, topic: string): string {
  const purpose =
    theme === DEFAULT_THEME && isNameLike(topic) && topic !== title
      ? `${theme.purpose}، با موضوع «${topic}»`
      : theme.purpose;

  const who = audience ? ` این بستر برای ${audience} است.` : '';

  return [
    `«${title}» بستری است برای ${purpose}.${who} هر کس می‌تواند با ثبت کارت، آنچه دارد یا به آن نیاز دارد را اعلام کند و هماهنگی در گفت‌وگوی عمومی زیر همان کارت انجام می‌شود.`,
    'مشارکت در این بستر داوطلبانه است و بر پایهٔ همکاری در نیکی، امانت‌داری و احترام به یکدیگر شکل می‌گیرد.',
  ].join('\n\n');
}

export function buildSpaceFromRules(prompt: string): SpaceBuildOutput {
  const theme = themeFor(prompt);
  const topic = topicOf(prompt);
  const title = titleFor(topic, theme);
  const audience = audienceFor(prompt);

  return spaceBuildOutputSchema.parse({
    kind: 'SPACE_BUILD',
    title,
    description: descriptionFor(title, theme, audience, topic),
    audience,
    participationMethods: [theme.firstMethod, 'گفت‌وگوی عمومی زیر کارت‌ها'],
    roles: [
      { ...theme.primary[0], isPrimary: true },
      { ...theme.primary[1], isPrimary: true },
      COORDINATOR,
    ],
    cardHints: [theme.hint],
    reviewNote: '',
  });
}
