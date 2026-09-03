import { z } from 'zod';

/**
 * The one error envelope every API response uses (docs/*-mvp-sonnet5.md
 * section 7: "تمام خطاها این envelope را دارند"). `code` is a stable,
 * never-repurposed machine code; `message` is Persian, human-readable, safe
 * to show directly; `correlationId` ties a client-visible failure back to
 * server logs (services/api echoes its own Fastify request id here);
 * `details` carries optional structured extras (validation issues, or a
 * domain-specific payload like the refreshed legal version info).
 */
export const apiErrorPayloadSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  correlationId: z.string().min(1),
  details: z.array(z.unknown()).default([]),
});
export type ApiErrorPayload = z.infer<typeof apiErrorPayloadSchema>;
/** `details` optional on the way in (defaults to `[]`) - what a caller constructs before this schema's own default fills it in. */
export type ApiErrorPayloadInput = z.input<typeof apiErrorPayloadSchema>;

export const apiErrorEnvelopeSchema = z.object({
  error: apiErrorPayloadSchema,
});
export type ApiErrorEnvelope = z.infer<typeof apiErrorEnvelopeSchema>;
