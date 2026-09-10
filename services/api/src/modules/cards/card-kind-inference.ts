import type { CardKind } from '@taavon/database';

export interface CardKindInference {
  inferredKind: CardKind;
  confidence: number;
}

/**
 * Temporary, rule-based classifier for "گونهٔ استنباطی" - Task 25 replaces
 * it with an AI provider behind this same shape. Pure keyword matching over
 * the card body: the first rule that matches wins, and an unmatched body is
 * AWARENESS with a deliberately low confidence so callers know it was a
 * fallback, not a real signal. This never becomes the card's own `kind` -
 * it lives alongside it in CardSemanticProfile.
 */
const RULES: ReadonlyArray<{ kind: CardKind; keywords: readonly string[] }> = [
  { kind: 'EVENT', keywords: ['رویداد', 'جلسه', 'برنامه', 'گردهمایی', 'ساعت', 'روز جمعه', 'روز شنبه', 'تاریخ'] },
  { kind: 'REQUEST', keywords: ['نیاز دارم', 'کمک', 'درخواست', 'لطفاً', 'می‌خواهم', 'احتیاج دارم'] },
  { kind: 'SERVICE', keywords: ['ارائه می‌دهم', 'خدمات', 'انجام می‌دهم', 'آموزش می‌دهم'] },
  { kind: 'OBSERVATION', keywords: ['دیدم', 'مشاهده', 'گزارش می‌دهم', 'متوجه شدم'] },
  { kind: 'CONSUMABLE_RESOURCE', keywords: ['رایگان بردارید', 'اهدا می‌کنم', 'مصرفی', 'بگیرید'] },
  { kind: 'REUSABLE_RESOURCE', keywords: ['قرض می‌دهم', 'امانت', 'به اشتراک می‌گذارم', 'در دسترس است'] },
  { kind: 'PARTICIPATION', keywords: ['بیایید', 'مشارکت', 'همکاری', 'داوطلب', 'با هم'] },
];

const MATCH_CONFIDENCE = 0.7;
const FALLBACK_CONFIDENCE = 0.2;

export function inferCardKind(body: string): CardKindInference {
  const text = body.toLowerCase();

  for (const rule of RULES) {
    if (rule.keywords.some((keyword) => text.includes(keyword))) {
      return { inferredKind: rule.kind, confidence: MATCH_CONFIDENCE };
    }
  }

  return { inferredKind: 'AWARENESS', confidence: FALLBACK_CONFIDENCE };
}
