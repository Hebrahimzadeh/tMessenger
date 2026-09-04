import { z } from 'zod';

export const mfaEnrollResponseSchema = z.object({
  secretBase32: z.string().min(1),
  otpauthUri: z.string().url(),
});
export type MfaEnrollResponse = z.infer<typeof mfaEnrollResponseSchema>;

/** Accepts either a 6-digit live TOTP code or an XXXX-XXXX recovery code - the server tries both (mfa.service.ts's challengeMfa). */
export const mfaCodeBodySchema = z.object({
  code: z.string().min(1).max(32),
});
export type MfaCodeBody = z.infer<typeof mfaCodeBodySchema>;

export const mfaConfirmResponseSchema = z.object({
  recoveryCodes: z.array(z.string()).length(10),
});
export type MfaConfirmResponse = z.infer<typeof mfaConfirmResponseSchema>;

export const mfaChallengeResponseSchema = z.object({
  ok: z.literal(true),
});
export type MfaChallengeResponse = z.infer<typeof mfaChallengeResponseSchema>;
