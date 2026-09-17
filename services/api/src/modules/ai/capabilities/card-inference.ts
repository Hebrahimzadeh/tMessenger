import {
  cardInferenceSchema,
  PATTERN_BY_KIND,
  type CardInference,
  type CardKindContract,
  type ClarifyingQuestion,
  type OperationalPattern,
} from '@taavon/contracts';
import type { AiOrchestrator } from '../orchestrator';

/** The space's own protocol, as far as a card draft is concerned. */
export interface SpaceProtocol {
  /** Example card templates the space's definition carries, if any. */
  cardHints: { title: string; description?: string }[];
  /** The roles someone could be acting in when they post here. */
  roleTitles: string[];
}

export interface CardInferenceInput {
  body: string;
  title?: string;
  protocol?: SpaceProtocol;
}

export interface CardInferenceDeps {
  orchestrator: AiOrchestrator;
}

/**
 * The classifier. Deterministic, offline, and the only thing that decides a
 * kind - the model never does.
 *
 * Ordered most specific first: a sentence can easily carry both a date and a
 * loan, and "قرض می‌دهم ... روز جمعه" is a lending with a day attached, not
 * an event. The interim `card-kind-inference.ts` had EVENT first and got
 * exactly that case wrong, which is why the order here is explicit and
 * tested rather than incidental.
 */
const RULES: ReadonlyArray<{ kind: CardKindContract; terms: readonly string[] }> = [
  {
    kind: 'REUSABLE_RESOURCE',
    terms: ['قرض می‌دهم', 'قرض بدهم', 'امانت', 'به امانت', 'عاریه', 'دارم و می‌توانم بدهم', 'در اختیار می‌گذارم'],
  },
  {
    kind: 'CONSUMABLE_RESOURCE',
    terms: ['اهدا می‌کنم', 'رایگان بردارید', 'مصرفی', 'اضافه آمده', 'زیادی آمده', 'ببرید استفاده کنید'],
  },
  { kind: 'SERVICE', terms: ['ارائه می‌دهم', 'خدمات', 'انجام می‌دهم', 'آموزش می‌دهم', 'تعمیر می‌کنم', 'بلدم'] },
  { kind: 'REQUEST', terms: ['نیاز دارم', 'احتیاج دارم', 'کمک می‌خواهم', 'کسی هست', 'درخواست', 'لازم دارم'] },
  { kind: 'EVENT', terms: ['رویداد', 'جلسه', 'گردهمایی', 'دورهمی', 'ساعت', 'روز جمعه', 'روز شنبه', 'تاریخ'] },
  { kind: 'PARTICIPATION', terms: ['بیایید', 'مشارکت', 'همکاری', 'داوطلب', 'با هم', 'دست به دست'] },
  { kind: 'OBSERVATION', terms: ['دیدم', 'مشاهده', 'گزارش می‌دهم', 'متوجه شدم', 'خراب است', 'نشتی'] },
];

/** A matched rule is a real signal; an unmatched body is a guess and says so. */
const MATCH_CONFIDENCE = 0.7;
const FALLBACK_CONFIDENCE = 0.2;

export interface Classification {
  kind: CardKindContract;
  confidence: number;
  matchedTerm: string | null;
}

export function classify(text: string): Classification {
  const haystack = text.toLowerCase();

  for (const rule of RULES) {
    const matchedTerm = rule.terms.find((term) => haystack.includes(term));
    if (matchedTerm) return { kind: rule.kind, confidence: MATCH_CONFIDENCE, matchedTerm };
  }

  // Not "unclassifiable" - AWARENESS is a real, publishable kind, and a
  // generic sentence is genuinely an awareness card. The low confidence is
  // what tells a caller this was a default rather than a reading.
  return { kind: 'AWARENESS', confidence: FALLBACK_CONFIDENCE, matchedTerm: null };
}

/**
 * The questions worth asking for each kind, and never more than three.
 *
 * Each one carries what would change if it were answered, because that is
 * the test of whether to ask at all - "سؤال فقط با behaviorAffected". None
 * of them blocks publishing: the composer shows them, the person answers the
 * ones they care about, and the card goes out either way.
 */
function questionsFor(kind: CardKindContract): ClarifyingQuestion[] {
  switch (kind) {
    case 'REUSABLE_RESOURCE':
      return [
        {
          topic: 'RETURNABILITY',
          question: 'بعد از استفاده باید به شما برگردانده شود؟',
          behaviorAffected: 'اگر بله، کارت پس از بسته‌شدنِ امانت تمام می‌شود و برای دفعهٔ بعد کارت تازه‌ای می‌سازید.',
        },
        {
          topic: 'RESERVATION',
          question: 'کسی می‌تواند از قبل آن را رزرو کند؟',
          behaviorAffected: 'رزرو، کارت را برای بقیه علامت‌گذاری می‌کند تا دو نفر هم‌زمان سراغش نروند.',
        },
        {
          topic: 'TIME_OR_PLACE',
          question: 'کِی و کجا می‌شود تحویلش گرفت؟',
          behaviorAffected: 'زمان و مکان در کارت نمایش داده می‌شود تا کسی بی‌هوا مراجعه نکند.',
        },
      ];

    case 'CONSUMABLE_RESOURCE':
      return [
        {
          topic: 'CAPACITY',
          question: 'چند نفر می‌توانند از آن بردارند؟',
          behaviorAffected: 'ظرفیت مشخص می‌کند کارت بعد از چند نفر بسته شود.',
        },
        {
          topic: 'TIME_OR_PLACE',
          question: 'از کجا می‌شود برداشت؟',
          behaviorAffected: 'مکان در کارت نمایش داده می‌شود.',
        },
      ];

    case 'EVENT':
      return [
        {
          topic: 'TIME_OR_PLACE',
          question: 'دقیقاً چه زمانی و کجا؟',
          behaviorAffected: 'زمان رویداد تعیین می‌کند کارت تا کِی فعال بماند.',
        },
        {
          topic: 'CAPACITY',
          question: 'ظرفیت محدودی دارد؟',
          behaviorAffected: 'ظرفیت مشخص می‌کند رزرو تا چند نفر باز بماند.',
        },
      ];

    case 'SERVICE':
      return [
        {
          topic: 'RESERVATION',
          question: 'کسی باید از قبل وقت بگیرد؟',
          behaviorAffected: 'اگر بله، کارت رزروپذیر می‌شود و نوبت‌ها از بقیه پنهان نمی‌ماند.',
        },
        {
          topic: 'TIME_OR_PLACE',
          question: 'چه روزها و ساعت‌هایی در دسترس هستید؟',
          behaviorAffected: 'زمان‌های در دسترس در کارت نمایش داده می‌شود.',
        },
      ];

    case 'REQUEST':
      return [
        {
          topic: 'TIME_OR_PLACE',
          question: 'تا چه زمانی به آن نیاز دارید؟',
          behaviorAffected: 'مهلت مشخص می‌کند کارت تا کِی در فهرست بماند.',
        },
      ];

    // Nothing here changes how the card behaves, so nothing is asked.
    case 'PARTICIPATION':
    case 'AWARENESS':
    case 'OBSERVATION':
      return [];
  }
}

function firstLine(text: string): string {
  return text.trim().split('\n')[0]?.trim() ?? '';
}

/**
 * What the platform had to assume, said out loud.
 *
 * Only ever about the card's behaviour, and only when the text did not say.
 * An assumption the person cannot see is one they cannot correct.
 */
function assumptionsFor(classification: Classification, pattern: OperationalPattern): string[] {
  const assumptions: string[] = [];

  if (classification.matchedTerm === null) {
    assumptions.push('از متن مشخص نشد این کارت دقیقاً چه نوعی است، بنابراین «اطلاع‌رسانی» در نظر گرفته شد.');
  } else {
    assumptions.push(`از عبارت «${classification.matchedTerm}» این‌طور برداشت شد. اگر اشتباه است، نوع را تغییر دهید.`);
  }

  if (pattern.reservable) {
    assumptions.push('فرض شد کسی می‌تواند این کارت را رزرو کند تا دو نفر هم‌زمان سراغش نروند.');
    assumptions.push('پس از بسته‌شدن، این کارت دوباره فعال نمی‌شود؛ دفعهٔ بعد کارت تازه‌ای بسازید.');
  }

  return assumptions;
}

/**
 * Builds the whole inference from rules alone.
 *
 * This is not a degraded mode. It is the baseline the model decorates, and
 * it is what runs when the model is off, unreachable, slow or wrong - so the
 * composer behaves identically in all four cases and in the ordinary one.
 */
export function inferFromRules(input: CardInferenceInput): CardInference {
  const classification = classify(`${input.title ?? ''}\n${input.body}`);
  const pattern = PATTERN_BY_KIND[classification.kind];

  return cardInferenceSchema.parse({
    kind: classification.kind,
    confidence: classification.confidence,
    // The person's own first line, not an invented headline. A title they
    // wrote is a better starting point than one that replaces their voice.
    suggestedTitle: input.title?.trim() || firstLine(input.body).slice(0, 120) || 'کارت تازه',
    suggestedBody: input.body.trim(),
    assumptions: assumptionsFor(classification, pattern),
    creativityApplied: false,
    operationalPattern: pattern,
    clarifyingQuestions: questionsFor(classification.kind),
  });
}

/** The space's own examples and roles, as context a draft can stay inside. */
function protocolContext(protocol: SpaceProtocol | undefined): string {
  if (!protocol) return '';
  const hints = protocol.cardHints.map((hint) => `- ${hint.title}${hint.description ? `: ${hint.description}` : ''}`);
  const roles = protocol.roleTitles.length > 0 ? [`نقش‌های این بستر: ${protocol.roleTitles.join('، ')}`] : [];
  if (hints.length === 0 && roles.length === 0) return '';
  return ['\n\nنمونه‌های این بستر:', ...hints, ...roles].join('\n');
}

/**
 * Infers how a piece of text should behave as a card.
 *
 * The split is the same one Task 24 established and for the same reason: the
 * kind, the pattern, the questions and the assumptions all come from rules,
 * and the model is asked for nothing but a better title and a tidier body.
 * A model cannot make a card reservable, cannot make its close non-terminal,
 * and cannot invent a question outside the four topics - not because it is
 * told not to, but because there is no field in its output that would carry
 * any of those.
 *
 * `creativityApplied` reports honestly which half the person is looking at.
 */
export async function inferCard(deps: CardInferenceDeps, input: CardInferenceInput, requesterId: string | null): Promise<CardInference> {
  const base = inferFromRules(input);

  try {
    const result = await deps.orchestrator.generate(
      {
        capability: 'CARD_DRAFT',
        source: 'PUBLIC_USER_INPUT',
        text: `${input.title ? `${input.title}\n` : ''}${input.body}${protocolContext(input.protocol)}`,
        provenance: { kind: 'USER_TYPED' },
      },
      requesterId
    );

    if (result.outcome === 'SUGGESTION' && result.output?.kind === 'CARD_DRAFT') {
      return cardInferenceSchema.parse({
        ...base,
        suggestedTitle: result.output.title,
        suggestedBody: result.output.body,
        creativityApplied: true,
      });
    }
  } catch {
    // The orchestrator only throws on a policy refusal, which cannot happen
    // for USER_TYPED public input. Anything unexpected still leaves the
    // rule-based inference intact rather than failing the request.
  }

  return base;
}
