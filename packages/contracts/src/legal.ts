import { z } from 'zod';

export const legalDocumentTypeSchema = z.enum(['TERMS', 'PRIVACY']);
export type LegalDocumentType = z.infer<typeof legalDocumentTypeSchema>;

export const legalCurrentResponseSchema = z.object({
  termsVersion: z.number().int().positive(),
  privacyVersion: z.number().int().positive(),
  termsUrl: z.string().url(),
  privacyUrl: z.string().url(),
});
export type LegalCurrentResponse = z.infer<typeof legalCurrentResponseSchema>;
