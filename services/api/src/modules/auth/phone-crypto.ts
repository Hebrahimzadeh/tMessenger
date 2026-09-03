import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * PHONE_ENCRYPTION_KEY is an operator-provided string of arbitrary length
 * (env.ts only enforces a minimum length, not an exact one) - derive a
 * fixed 32-byte AES-256 key from it via SHA-256, independent of the raw
 * HMAC key used by hashPhone below.
 */
function deriveAesKey(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest();
}

/**
 * Deterministic, one-way. Safe to index and to look up "does this phone
 * number already have an account" without ever storing or logging the
 * plaintext number.
 */
export function hashPhone(phoneE164: string, secret: string): string {
  return createHmac('sha256', secret).update(phoneE164, 'utf8').digest('hex');
}

/**
 * Reversible, authenticated (AES-256-GCM) encryption for the narrow set of
 * operations that need the real number back (e.g. sending an OTP SMS).
 * Output is `iv || authTag || ciphertext`, base64-encoded, so it round-trips
 * as a single opaque string column.
 */
export function encryptPhone(phoneE164: string, secret: string): string {
  const key = deriveAesKey(secret);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(phoneE164, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptPhone(ciphertext: string, secret: string): string {
  const key = deriveAesKey(secret);
  const data = Buffer.from(ciphertext, 'base64');
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
