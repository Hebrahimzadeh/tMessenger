import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';

const OTP_CODE_LENGTH = 6;
const OTP_CODE_SPACE = 10 ** OTP_CODE_LENGTH;
const REFRESH_TOKEN_BYTES = 32;

/** CSPRNG 6-digit numeric OTP code (Task 05/06: never store the raw value - see hashOtpCode). */
export function generateOtpCode(): string {
  return randomInt(0, OTP_CODE_SPACE).toString().padStart(OTP_CODE_LENGTH, '0');
}

/** HMAC-SHA256 of an OTP code, keyed by a server secret (SESSION_HMAC_KEY - this is an authentication-session concern, not phone PII, so it deliberately does not reuse PHONE_ENCRYPTION_KEY). */
export function hashOtpCode(code: string, secret: string): string {
  return createHmac('sha256', secret).update(code, 'utf8').digest('hex');
}

/**
 * Constant-time comparison of a supplied code against its stored hash.
 * Returns false (rather than throwing) for a malformed/wrong-length stored
 * hash, so a corrupted challenge record fails closed instead of crashing
 * the request.
 */
export function otpCodeMatches(suppliedCode: string, storedHash: string, secret: string): boolean {
  const supplied = Buffer.from(hashOtpCode(suppliedCode, secret), 'hex');
  let stored: Buffer;
  try {
    stored = Buffer.from(storedHash, 'hex');
  } catch {
    return false;
  }
  if (supplied.length !== stored.length) return false;
  return timingSafeEqual(supplied, stored);
}

/** Opaque, unguessable id for an OTP challenge - safe to hand to the client. */
export function generateChallengeId(): string {
  return randomUUID();
}

/** CSPRNG refresh token (256 bits) - only its hash is ever persisted, see hashRefreshToken. */
export function generateRefreshToken(): string {
  return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
}

/**
 * Plain SHA-256 lookup hash of a refresh token - no secret needed: the
 * token itself carries 256 bits of entropy, so an unsalted, unkeyed hash is
 * not brute-forceable even if this algorithm is public knowledge (the
 * standard justification for hashing high-entropy bearer tokens this way).
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
