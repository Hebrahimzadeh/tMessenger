import { z } from 'zod';

export const cardKindSchema = z.enum([
  'AWARENESS',
  'OBSERVATION',
  'REUSABLE_RESOURCE',
  'CONSUMABLE_RESOURCE',
  'REQUEST',
  'SERVICE',
  'PARTICIPATION',
  'EVENT',
]);
export type CardKindContract = z.infer<typeof cardKindSchema>;

export const cardStatusSchema = z.enum(['ACTIVE', 'ARCHIVED', 'REMOVED']);
export type CardStatusContract = z.infer<typeof cardStatusSchema>;

/** Only these four go through upload-intent/finalize. LINK and APPROXIMATE_LOCATION are provided inline and never touch object storage. */
export const uploadableAttachmentKindSchema = z.enum(['IMAGE', 'AUDIO', 'VIDEO', 'FILE']);
export type UploadableAttachmentKind = z.infer<typeof uploadableAttachmentKindSchema>;

export const cardAttachmentKindSchema = z.enum(['IMAGE', 'AUDIO', 'VIDEO', 'FILE', 'LINK', 'APPROXIMATE_LOCATION']);
export type CardAttachmentKindContract = z.infer<typeof cardAttachmentKindSchema>;

export const cardAttachmentStatusSchema = z.enum(['PENDING', 'PROCESSING', 'READY', 'REJECTED']);
export type CardAttachmentStatusContract = z.infer<typeof cardAttachmentStatusSchema>;

const BODY_MAX = 8000;
const TITLE_MAX = 200;

export const cardLinkInputSchema = z.object({
  url: z.string().trim().url().max(2000),
  label: z.string().trim().max(200).optional(),
});
export type CardLinkInput = z.infer<typeof cardLinkInputSchema>;

export const cardLocationInputSchema = z.object({
  label: z.string().trim().min(1).max(200),
  approxLat: z.number().min(-90).max(90).optional(),
  approxLng: z.number().min(-180).max(180).optional(),
});
export type CardLocationInput = z.infer<typeof cardLocationInputSchema>;

/**
 * What the person confirmed after previewing an inference.
 *
 * Deliberately narrow: only the classification is carried, because the title
 * and body they accepted are already in the ordinary create fields by then.
 * This is what lands in `CardSemanticProfile` - "نتیجهٔ تأییدشده را به
 * CardSemanticProfile وصل کن" - so the profile records what a person agreed
 * to rather than what a keyword pass guessed a second time.
 *
 * It lives here rather than beside the rest of the inference contract so the
 * dependency stays one-way: card-inference.ts needs `cardKindSchema`, and a
 * cycle between two Zod modules leaves one of them holding `undefined` at
 * evaluation time.
 */
export const confirmedInferenceSchema = z.object({
  inferredKind: cardKindSchema,
  confidence: z.number().min(0).max(1),
});
export type ConfirmedInference = z.infer<typeof confirmedInferenceSchema>;

/** "متن تنها یا پیوست معنادار کافی" - a card needs *something*: body text, at least one finalized file attachment, a link, or a location. `kind` is never required ("user مجبور به انتخاب نیست"). */
export const createCardBodySchema = z
  .object({
    body: z.string().trim().max(BODY_MAX).default(''),
    title: z.string().trim().max(TITLE_MAX).optional(),
    kind: cardKindSchema.optional(),
    attachmentIds: z.array(z.string().uuid()).max(20).default([]),
    links: z.array(cardLinkInputSchema).max(20).default([]),
    locations: z.array(cardLocationInputSchema).max(10).default([]),
    /**
     * What the person confirmed after previewing an inference, if they
     * previewed one at all. Optional on purpose: publishing without ever
     * asking for a suggestion is the ordinary path, not a degraded one, and
     * the server falls back to its own offline classifier when this is
     * absent - which is also what keeps the whole composer working with the
     * model switched off.
     */
    confirmedInference: confirmedInferenceSchema.optional(),
  })
  .refine(
    (v) => v.body.length > 0 || v.attachmentIds.length > 0 || v.links.length > 0 || v.locations.length > 0,
    { message: 'کارت باید حداقل یک متن یا پیوست معنادار داشته باشد.' }
  );
export type CreateCardBody = z.infer<typeof createCardBodySchema>;

export const updateCardBodySchema = z
  .object({
    body: z.string().trim().max(BODY_MAX).default(''),
    title: z.string().trim().max(TITLE_MAX).optional(),
    kind: cardKindSchema.optional(),
    attachmentIds: z.array(z.string().uuid()).max(20).default([]),
    links: z.array(cardLinkInputSchema).max(20).default([]),
    locations: z.array(cardLocationInputSchema).max(10).default([]),
  })
  .refine(
    (v) => v.body.length > 0 || v.attachmentIds.length > 0 || v.links.length > 0 || v.locations.length > 0,
    { message: 'کارت باید حداقل یک متن یا پیوست معنادار داشته باشد.' }
  );
export type UpdateCardBody = z.infer<typeof updateCardBodySchema>;

export const uploadIntentBodySchema = z.object({
  kind: uploadableAttachmentKindSchema,
});
export type UploadIntentBody = z.infer<typeof uploadIntentBodySchema>;

export const uploadIntentResponseSchema = z.object({
  attachmentId: z.string().uuid(),
  objectKey: z.string(),
});
export type UploadIntentResponse = z.infer<typeof uploadIntentResponseSchema>;

export const finalizeAttachmentResponseSchema = z.object({
  attachmentId: z.string().uuid(),
  status: cardAttachmentStatusSchema,
  rejectionReason: z.string().nullable(),
});
export type FinalizeAttachmentResponse = z.infer<typeof finalizeAttachmentResponseSchema>;

export const cardAttachmentViewSchema = z.object({
  id: z.string().uuid(),
  kind: cardAttachmentKindSchema,
  status: cardAttachmentStatusSchema,
  contentType: z.string().nullable(),
  sizeBytes: z.number().int().nullable(),
  /** Signed, time-limited read URL - present ONLY for a READY file attachment, never for a REJECTED or not-yet-ready one. */
  readUrl: z.string().nullable(),
  linkUrl: z.string().nullable(),
  locationLabel: z.string().nullable(),
  approxLat: z.number().nullable(),
  approxLng: z.number().nullable(),
});
export type CardAttachmentView = z.infer<typeof cardAttachmentViewSchema>;

export const cardResponseSchema = z.object({
  id: z.string().uuid(),
  spaceId: z.string().uuid(),
  authorId: z.string().uuid(),
  kind: cardKindSchema,
  status: cardStatusSchema,
  publishedAt: z.string().datetime(),
  revision: z.object({
    revisionNumber: z.number().int().positive(),
    title: z.string(),
    body: z.string(),
  }),
  /** The rule-based guess kept alongside `kind`, never replacing it. */
  inferredKind: cardKindSchema,
  attachments: z.array(cardAttachmentViewSchema),
});
export type CardResponse = z.infer<typeof cardResponseSchema>;

export const cardListItemSchema = z.object({
  id: z.string().uuid(),
  authorId: z.string().uuid(),
  kind: cardKindSchema,
  publishedAt: z.string().datetime(),
  title: z.string(),
  body: z.string(),
  attachmentCount: z.number().int(),
});
export type CardListItem = z.infer<typeof cardListItemSchema>;

export const cardListResponseSchema = z.object({
  items: z.array(cardListItemSchema),
  nextCursor: z.string().nullable(),
});
export type CardListResponse = z.infer<typeof cardListResponseSchema>;
