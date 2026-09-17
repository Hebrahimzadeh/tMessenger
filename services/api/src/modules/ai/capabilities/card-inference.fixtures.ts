import type { CardKindContract } from '@taavon/contracts';
import type { CardInferenceInput } from './card-inference';

export interface CardFixture {
  name: string;
  input: CardInferenceInput;
  expected: CardKindContract;
  /** Why this case exists, in one line. */
  because: string;
}

/**
 * The cases this inference has to get right, written as Persian a person
 * would actually type into a single box.
 *
 * Grouped by what would go wrong if it were careless rather than by the
 * answer they expect. The hard ones are the overlaps: a lending with a day
 * in it, a request that mentions a service, and three generic sentences that
 * must not be refused for being generic.
 */
export const CARD_FIXTURES: CardFixture[] = [
  // --- the one the plan names explicitly -------------------------------
  {
    name: 'the ladder',
    input: { body: 'یک نردبان دارم که می‌توانم قرض بدهم. هر وقت لازم داشتید خبر بدهید.' },
    expected: 'REUSABLE_RESOURCE',
    because: 'The plan\'s own example: lent, returned, and the card is finished when the lending is.',
  },
  {
    name: 'a lending with a day attached',
    input: { body: 'مته را قرض می‌دهم، روز جمعه در دسترس هستم.' },
    expected: 'REUSABLE_RESOURCE',
    because: 'A date does not make it an event. The interim classifier read EVENT first and got this wrong.',
  },

  // --- the other five kinds the plan asks for --------------------------
  {
    name: 'neighbourhood news',
    input: { body: 'امروز دیدم که شیر آب پارک نشتی دارد و به شهرداری گزارش می‌دهم.' },
    expected: 'OBSERVATION',
    because: 'Something noticed and reported. Nothing to reserve, nothing to close.',
  },
  {
    name: 'a consumable',
    input: { body: 'چند قوطی رنگ اضافه آمده، رایگان بردارید تا تمام شود.' },
    expected: 'CONSUMABLE_RESOURCE',
    because: 'Taken and gone - it does not come back, so the questions are about how many.',
  },
  {
    name: 'a service',
    input: { body: 'تعمیر دوچرخه انجام می‌دهم و برای بچه‌های محله رایگان است.' },
    expected: 'SERVICE',
    because: 'An offer of work, which somebody books rather than borrows.',
  },
  {
    name: 'a request for help',
    input: { body: 'برای جابه‌جایی وسایل به دو نفر نیاز دارم.' },
    expected: 'REQUEST',
    because: 'Someone needs something. Reservable, because taking it on is a real commitment.',
  },
  {
    name: 'an event',
    input: { body: 'جلسهٔ هماهنگی اهالی، روز جمعه ساعت ۱۰ صبح در پارک محله.' },
    expected: 'EVENT',
    because: 'A time and a place, with a capacity worth asking about.',
  },
  {
    name: 'an invitation to take part',
    input: { body: 'بیایید با هم داوطلبانه باغچهٔ محله را تمیز کنیم.' },
    expected: 'PARTICIPATION',
    because: 'Open-ended. Joining in is not a slot anybody holds, so it is not reservable.',
  },

  // --- generic text. Must never be refused for being vague -------------
  {
    name: 'something to help with',
    input: { body: 'یه چیزی برای کمک دارم' },
    expected: 'AWARENESS',
    because: 'The plan\'s own generic case. Publishable as it stands, with a low confidence saying so.',
  },
  {
    name: 'a single vague sentence',
    input: { body: 'یه خبر برای محله' },
    expected: 'AWARENESS',
    because: 'Almost no information, and still a real card.',
  },
  {
    name: 'a generic sentence inside a space that has examples',
    input: {
      body: 'چیزی دارم که شاید به درد بخورد',
      protocol: {
        cardHints: [{ title: 'نمونه: اعلام آمادگی', description: 'من می‌توانم پنجشنبه‌ها کمک کنم.' }],
        roleTitles: ['هماهنگ‌کننده', 'مشارکت‌کننده'],
      },
    },
    expected: 'AWARENESS',
    because: 'The space protocol may shape the draft; it must not change the classification into a guess.',
  },
];
