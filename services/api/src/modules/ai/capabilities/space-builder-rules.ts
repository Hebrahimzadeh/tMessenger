import { spaceBuildOutputSchema, type SpaceBuildOutput, type SpaceOpeningCard } from '@taavon/contracts';

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
 *
 * That last rule is what shapes its three opening cards. They are real cards
 * published under the creator's name, so every one of them is something the
 * creator is actually doing by opening the space - an invitation, and two
 * questions - and never a claim about what they own, did or promised. The
 * model, which has the person's own prompt to work from, can be specific
 * where these cannot.
 */

interface Theme {
  terms: readonly string[];
  /** Used as the title when the prompt leaves nothing noun-like behind ("کمک کنیم"). */
  title: string;
  /** What the space is for, as the end of "بستری است برای ...". */
  purpose: string;
  primary: [{ title: string; description: string }, { title: string; description: string }];
  firstMethod: string;
  /** Exactly three, because every space opens with exactly three cards. */
  openingCards: readonly [SpaceOpeningCard, SpaceOpeningCard, SpaceOpeningCard];
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
    openingCards: [
      {
        caption:
          'این بستر را برای امانت‌دادن و امانت‌گرفتن وسایلی ساختم که کم استفاده می‌شوند و بیشتر وقت‌ها بی‌کار می‌مانند. هر کس چنین وسیله‌ای دارد می‌تواند همین‌جا کارتش را ثبت کند.',
        comment: 'اگر وسیله‌ای دارید که حاضرید امانت بدهید، همین زیر بنویسید چه چیزی است و چند روز در دسترس است.',
      },
      {
        caption: 'چه وسیله‌ای دارید که ماه‌هاست به آن دست نزده‌اید؟ همان وسیله ممکن است کار کسی را راه بیندازد.',
        comment: 'نام وسیله و مدتی که می‌توانید امانت بدهید را بنویسید.',
      },
      {
        caption: 'به چه وسیله‌ای نیاز دارید که خریدنش برای یک‌بار استفاده به‌صرفه نیست؟',
        comment: 'نام وسیله و مدتی که لازمش دارید را بنویسید تا ببینیم چه کسی همان را دارد.',
      },
    ],
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
    openingCards: [
      {
        caption:
          'این بستر را ساختم تا هر کس چیزی می‌داند بتواند آن را به دیگران یاد بدهد، و هر کس چیزی می‌خواهد بیاموزد بداند از کی بپرسد.',
        comment: 'اگر مهارتی دارید که می‌توانید آموزش بدهید، همین زیر نامش را بنویسید.',
      },
      {
        caption: 'چه مهارتی دارید که می‌توانید در یک جلسهٔ کوتاه به دیگران یاد بدهید؟',
        comment: 'موضوع و سطح مناسب را بنویسید تا علاقه‌مندها خودشان را معرفی کنند.',
      },
      {
        caption: 'چه چیزی هست که مدت‌ها می‌خواستید یاد بگیرید و نشده؟',
        comment: 'موضوع و اینکه تا کجا پیش رفته‌اید را بنویسید تا ببینیم چه کسی می‌تواند همراهی کند.',
      },
    ],
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
    openingCards: [
      {
        caption:
          'این بستر را ساختم تا کارهای کوچکی که از دست هرکدام از ما برمی‌آید به کسی برسد که به همان کار نیاز دارد.',
        comment: 'اگر کاری از دستتان برمی‌آید، همین زیر بنویسید چه کاری است.',
      },
      {
        caption: 'چه کاری هست که برای شما ساده است و برای کسی دیگر دشوار؟',
        comment: 'نوع کار و زمان‌هایی که در دسترس هستید را بنویسید.',
      },
      {
        caption: 'چه کاری مانده روی دستتان که تنهایی از پیش نمی‌رود؟',
        comment: 'بنویسید چه کاری است و تا چه زمانی فرصت دارد.',
      },
    ],
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
    openingCards: [
      {
        caption:
          'این بستر را ساختم تا یاری‌ای که از دست ما برمی‌آید به کسی برسد که به آن نیاز دارد، بی‌آنکه آبروی کسی در میان بیاید.',
        comment: 'اگر کاری از دستتان برمی‌آید همین زیر بنویسید؛ نام و مشخصات هیچ‌کس را ننویسید.',
      },
      {
        caption: 'چه یاری‌ای از دست شما برمی‌آید؟ از یک ساعت وقت تا یک مهارت، هرچه باشد به کار می‌آید.',
        comment: 'نوع یاری و زمانی که در دسترس هستید را بنویسید.',
      },
      {
        caption: 'اگر نیازی دارید، می‌توانید همین‌جا مطرحش کنید؛ لازم نیست نام یا جزئیات خصوصی کسی نوشته شود.',
        comment: 'تنها همان‌قدر بنویسید که برای کمک‌کردن لازم است.',
      },
    ],
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
    openingCards: [
      {
        caption: 'این بستر را ساختم تا برنامه‌های سالم برای کودکان و نوجوانان با هم هماهنگ شود.',
        comment: 'اگر فکری برای یک برنامه دارید، همین زیر بنویسید.',
      },
      {
        caption: 'چه برنامه‌ای برای بچه‌ها در ذهن دارید که با همراهی چند خانواده شدنی است؟',
        comment: 'نوع فعالیت و گروه سنی مناسب را بنویسید.',
      },
      {
        caption: 'بچه‌های شما به چه فعالیتی علاقه دارند که کم برگزار می‌شود؟',
        comment: 'گروه سنی و روزهایی که برایتان مناسب است را بنویسید.',
      },
    ],
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
  openingCards: [
    {
      caption: 'این بستر را ساختم تا کاری که تنهایی از پیش نمی‌رود با همکاری چند نفر شکل بگیرد.',
      comment: 'اگر همراه می‌شوید، همین زیر بنویسید چه سهمی می‌توانید برعهده بگیرید.',
    },
    {
      caption: 'چه کاری از دست شما برمی‌آید که به این کار مشترک کمک می‌کند؟',
      comment: 'توانتان و زمان‌هایی که در دسترس هستید را بنویسید.',
    },
    {
      caption: 'چه چیزی برای شروع لازم است که هنوز نداریم؟',
      comment: 'بنویسید چه چیزی لازم است و برای کدام مرحله.',
    },
  ],
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
    openingCards: theme.openingCards,
    reviewNote: '',
  });
}
