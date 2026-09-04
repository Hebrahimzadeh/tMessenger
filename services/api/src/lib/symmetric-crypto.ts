import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Generic AES-256-GCM encrypt/decrypt for any sensitive string at rest -
 * the same scheme services/api/src/modules/auth/phone-crypto.ts uses for
 * phone numbers (Task 05), extracted here so a second PII domain (Task 09's
 * identity-claim evidence) doesn't need to call a function literally named
 * "encryptPhone" for non-phone data. phone-crypto.ts is left as-is
 * (already reviewed/approved) rather than refactored to share this.
 */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest();
}

export function encrypt(plaintext: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decrypt(ciphertext: string, secret: string): string {
  const key = deriveKey(secret);
  const data = Buffer.from(ciphertext, 'base64');
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
