import type { AiCapability, AiOutput } from '@taavon/contracts';
import { buildSpaceFromRules } from './capabilities/space-builder-rules';
import { extractUserPrompt } from './capabilities/space-builder';

/**
 * What each capability answers when the model is unusable.
 *
 * Rule-based and offline, on purpose - "fallback قاعده‌محور بدون network".
 * A fallback that needed the network would be unavailable in exactly the
 * circumstances it exists for.
 *
 * Each one is written to be honest rather than to imitate a model. It says
 * something genuinely useful and does not pretend to be a generated answer,
 * because a person acting on a suggestion deserves to know whether a model
 * actually produced it. The orchestrator marks the outcome FALLBACK so the
 * interface can say so too.
 */
export function fallbackFor(capability: AiCapability, input: string): AiOutput {
  switch (capability) {
    case 'SPACE_GUIDANCE':
      return {
        kind: 'SPACE_GUIDANCE',
        headline: 'چند نکته برای نوشتن بستر',
        suggestions: [
          'بنویسید این بستر برای حل چه نیازی در محله شکل گرفته است.',
          'مشخص کنید چه کسی می‌تواند مشارکت کند و اولین قدمش چیست.',
          'یک نمونهٔ واقعی از کاری که قرار است انجام شود اضافه کنید.',
        ],
      };

    case 'CARD_DRAFT':
      return {
        kind: 'CARD_DRAFT',
        // The person's own words, kept rather than replaced. A draft they
        // wrote is a better starting point than an invented one.
        title: firstLine(input).slice(0, 120) || 'کارت تازه',
        body: input.trim(),
      };

    case 'ASSISTANT_REPLY':
      return {
        kind: 'ASSISTANT_REPLY',
        reply:
          'الان نمی‌توانم پاسخ بدهم. می‌توانید کارت یا بستر را دستی بسازید؛ هیچ‌کدام از مسیرها به من وابسته نیست.',
      };

    case 'SPACE_BUILD':
      // The orchestrator only ever sees the prompt wrapped in the document's
      // markers, so unwrap it first - otherwise the rule builder would read
      // the markers as part of what the person wanted.
      return buildSpaceFromRules(extractUserPrompt(input));

    case 'MODERATION_ASSIST':
      return {
        kind: 'MODERATION_ASSIST',
        // Deliberately empty. An automated "concern" that nothing actually
        // examined would be worse than none: it invites a moderator to weigh
        // a finding that does not exist.
        summary: 'خلاصهٔ خودکار در دسترس نیست. پرونده باید دستی بررسی شود.',
        concerns: [],
      };
  }
}

function firstLine(text: string): string {
  return text.trim().split('\n')[0]?.trim() ?? '';
}
