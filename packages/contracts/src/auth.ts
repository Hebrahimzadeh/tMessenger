import { z } from 'zod';

/** Seconds an OTP challenge stays valid for (Task 06 interface: "انقضای ۳۰۰ ثانیه"). */
export const OTP_CHALLENGE_TTL_SECONDS = 300;

export const otpRequestBodySchema = z.object({
  phone: z.string().min(1).max(32),
  // Loosely validated here (shape only) - normalizePhone (services/api) is
  // the single source of truth for which countries are actually supported;
  // duplicating that exact list into the wire contract would just be two
  // places to keep in sync for no real benefit.
  country: z.string().length(2),
});
export type OtpRequestBody = z.infer<typeof otpRequestBodySchema>;

// Always 202 with this exact shape for any schema-valid body - see
// auth.service.ts's requestOtp for why (anti-enumeration: a made-up phone
// number, an unsupported country, and a real existing user's number are all
// indistinguishable from the response alone).
export const otpRequestResponseSchema = z.object({
  challengeId: z.string().min(1),
  expiresInSeconds: z.literal(OTP_CHALLENGE_TTL_SECONDS),
  termsVersion: z.number().int().positive(),
  privacyVersion: z.number().int().positive(),
});
export type OtpRequestResponse = z.infer<typeof otpRequestResponseSchema>;

export const otpVerifyBodySchema = z.object({
  challengeId: z.string().min(1),
  code: z.string().min(1).max(16),
  termsVersion: z.number().int().positive(),
  privacyVersion: z.number().int().positive(),
});
export type OtpVerifyBody = z.infer<typeof otpVerifyBodySchema>;

export const otpVerifyResponseSchema = z.object({
  userId: z.string().uuid(),
});
export type OtpVerifyResponse = z.infer<typeof otpVerifyResponseSchema>;

/**
 * Machine-readable failure codes for the auth endpoints. Deliberately does
 * NOT distinguish "challenge never existed" from "challenge expired" (both
 * collapse to OTP_EXPIRED) - that distinction would itself be an
 * enumeration/timing oracle.
 */
export const authErrorCodeSchema = z.enum([
  'OTP_EXPIRED',
  'OTP_INVALID_CODE',
  'OTP_ALREADY_USED',
  'OTP_TOO_MANY_ATTEMPTS',
  'LEGAL_VERSION_CHANGED',
  'RATE_LIMITED',
  'SESSION_INVALID',
]);
export type AuthErrorCode = z.infer<typeof authErrorCodeSchema>;

export const legalVersionChangedResponseSchema = z.object({
  error: z.literal('LEGAL_VERSION_CHANGED'),
  current: z.object({
    termsVersion: z.number().int().positive(),
    privacyVersion: z.number().int().positive(),
    termsUrl: z.string().url(),
    privacyUrl: z.string().url(),
  }),
});
export type LegalVersionChangedResponse = z.infer<typeof legalVersionChangedResponseSchema>;
