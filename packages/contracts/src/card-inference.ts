import { z } from 'zod';
import { cardKindSchema, type CardKindContract as CardKind } from './card';

/**
 * How a card behaves once it exists.
 *
 * Two booleans rather than a free-form description, because these are the
 * only two things the domain actually acts on: whether someone can reserve
 * it, and whether closing that reservation ends the card for good.
 *
 * `terminalCloseAfterUse` is not a preference anybody gets to set - it
 * describes what this platform already does. A `CardReservation` that
 * reaches `RESERVATION_CLOSED` never changes state again ("reactivation
 * صفر"); posting the ladder next month is a new card, not the old one
 * coming back. Surfacing it here means the person is told that *before*
 * they publish, rather than discovering it when their card goes quiet.
 */
export const operationalPatternSchema = z.object({
  reservable: z.boolean(),
  terminalCloseAfterUse: z.boolean(),
});
export type OperationalPattern = z.infer<typeof operationalPatternSchema>;

/**
 * How each kind behaves, as a fact about this platform rather than a guess.
 *
 * `terminalCloseAfterUse` is `true` for exactly the reservable kinds, and
 * that is not a coincidence to be tidied away: `CardReservation` has no
 * transition out of `RESERVATION_CLOSED` (see schema.prisma - "reactivation
 * صفر"), so any card someone can reserve is a card whose close is final.
 * A non-reservable card has nothing to close, so the flag is false rather
 * than meaningless. the capability's tests assert the pair stays
 * consistent, because the day somebody adds a reactivation path this table
 * is the thing that has to change with it.
 */
export const PATTERN_BY_KIND: Record<CardKind, OperationalPattern> = {
  // Someone borrows the ladder and brings it back; the card closes when the
  // lending is done, and next month's ladder is a new card.
  REUSABLE_RESOURCE: { reservable: true, terminalCloseAfterUse: true },
  // Taken and gone - the surplus paint does not come back.
  CONSUMABLE_RESOURCE: { reservable: true, terminalCloseAfterUse: true },
  // Somebody takes the request on, and it is finished when it is finished.
  REQUEST: { reservable: true, terminalCloseAfterUse: true },
  SERVICE: { reservable: true, terminalCloseAfterUse: true },
  EVENT: { reservable: true, terminalCloseAfterUse: true },
  // Open-ended by nature: joining in is not a slot anybody holds.
  PARTICIPATION: { reservable: false, terminalCloseAfterUse: false },
  AWARENESS: { reservable: false, terminalCloseAfterUse: false },
  OBSERVATION: { reservable: false, terminalCloseAfterUse: false },
};


/**
 * The only four things a clarifying question may be about.
 *
 * A closed list, not a suggestion. Anything outside it - who you are, why
 * you are doing this, whether you are sure - is either not the platform's
 * business or does not change how the card behaves, and a question that
 * changes nothing is friction wearing a helpful face.
 */
export const clarifyingQuestionTopicSchema = z.enum([
  'RETURNABILITY',
  'CAPACITY',
  'TIME_OR_PLACE',
  'RESERVATION',
]);
export type ClarifyingQuestionTopic = z.infer<typeof clarifyingQuestionTopicSchema>;

/**
 * `behaviorAffected` is required, and that is the whole point of the type.
 *
 * It names what would actually change if the question were answered. A
 * question that cannot fill it in is one nobody should be asked, so the
 * schema refuses to represent it.
 */
export const clarifyingQuestionSchema = z.object({
  topic: clarifyingQuestionTopicSchema,
  question: z.string().min(1).max(300),
  behaviorAffected: z.string().min(1).max(200),
});
export type ClarifyingQuestion = z.infer<typeof clarifyingQuestionSchema>;

/**
 * What the inference proposes for one piece of text.
 *
 * Everything here is a proposal. The person can take the kind and reject the
 * title, take the title and reject the pattern, or ignore the whole thing and
 * publish exactly what they typed - "user بتواند kind/pattern را اصلاح یا
 * نادیده بگیرد".
 *
 * `creativityApplied` is false when nothing but rules produced this, which
 * happens whenever the model is off, unreachable or returned something
 * unusable. It is shown to the person rather than hidden: someone acting on
 * a suggestion deserves to know whether a model actually wrote it.
 */
export const cardInferenceSchema = z.object({
  kind: cardKindSchema,
  confidence: z.number().min(0).max(1),
  suggestedTitle: z.string().min(1).max(200),
  suggestedBody: z.string().min(1).max(8000),
  /** What had to be assumed because the text did not say. Shown, never hidden. */
  assumptions: z.array(z.string().min(1).max(300)).max(6),
  creativityApplied: z.boolean(),
  operationalPattern: operationalPatternSchema,
  clarifyingQuestions: z.array(clarifyingQuestionSchema).max(3),
});
export type CardInference = z.infer<typeof cardInferenceSchema>;

export const inferCardBodySchema = z.object({
  body: z.string().trim().min(1).max(8000),
  title: z.string().trim().max(200).optional(),
});
export type InferCardBody = z.infer<typeof inferCardBodySchema>;
