import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32 (no padding on encode - authenticator apps/manual entry never need it). */
export function base32Encode(buffer: Buffer): string {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');

  let output = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, '0');
    output += BASE32_ALPHABET[parseInt(chunk, 2)];
  }
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, '');
  let bits = '';
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error(`Invalid base32 character: "${char}"`);
    bits += index.toString(2).padStart(5, '0');
  }

  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

type TotpAlgorithm = 'sha1' | 'sha256' | 'sha512';

/**
 * HOTP (RFC 4226) - the counter-based core TOTP builds on. `counter` is
 * encoded as an 8-byte big-endian integer per the RFC; `Math.floor` keeps
 * this correct for any counter value this app will ever produce (a 30s
 * step means the counter only exceeds Number.MAX_SAFE_INTEGER long after
 * the heat death of relevant concerns).
 */
function hotp(secret: Buffer, counter: number, digits: number, algorithm: TotpAlgorithm): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  counterBuffer.writeUInt32BE(counter % 2 ** 32, 4);

  const hmac = createHmac(algorithm, secret).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);

  return (binary % 10 ** digits).toString().padStart(digits, '0');
}

export interface TotpOptions {
  at?: number;
  digits?: number;
  stepSeconds?: number;
  algorithm?: TotpAlgorithm;
}

/**
 * Real-world authenticator apps (Google Authenticator, Authy, etc.) only
 * support SHA1/6-digit/30s - these are the production defaults, not a
 * weaker fallback. RFC 6238's own test vectors (8-digit, still SHA1) are
 * what `totp.test.ts` verifies this implementation against directly.
 */
export function computeTotpCode(secretBase32: string, options: TotpOptions = {}): string {
  const { at = Date.now(), digits = 6, stepSeconds = 30, algorithm = 'sha1' } = options;
  const counter = Math.floor(at / 1000 / stepSeconds);
  return hotp(base32Decode(secretBase32), counter, digits, algorithm);
}

export interface VerifyTotpOptions extends TotpOptions {
  /** Number of steps before/after the current one to also accept, tolerating clock drift. */
  window?: number;
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function verifyTotpCode(secretBase32: string, suppliedCode: string, options: VerifyTotpOptions = {}): boolean {
  const { at = Date.now(), digits = 6, stepSeconds = 30, algorithm = 'sha1', window = 1 } = options;
  const counter = Math.floor(at / 1000 / stepSeconds);
  const secret = base32Decode(secretBase32);

  for (let drift = -window; drift <= window; drift += 1) {
    const candidate = hotp(secret, counter + drift, digits, algorithm);
    if (timingSafeEqualStrings(candidate, suppliedCode)) return true;
  }
  return false;
}

/** 160-bit (20-byte) secret - RFC 4226's own recommended minimum length for HMAC-SHA1. */
export function generateTotpSecret(byteLength = 20): string {
  return base32Encode(randomBytes(byteLength));
}

/** `otpauth://` URI most authenticator apps can import directly (via QR code or manual paste) instead of manual secret entry. */
export function totpUri(secretBase32: string, accountLabel: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
