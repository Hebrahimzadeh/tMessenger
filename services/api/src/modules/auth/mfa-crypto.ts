import { createHash, randomInt } from 'node:crypto';

// Same restricted alphabet as base32 (totp.ts) - no ambiguous characters
// (0/O, 1/I), so a human reading a recovery code off a screen or a
// password manager never has to guess which glyph they're looking at.
const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const GROUP_LENGTH = 4;
const DEFAULT_COUNT = 10;

function randomGroup(): string {
  let group = '';
  for (let i = 0; i < GROUP_LENGTH; i += 1) {
    group += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  }
  return group;
}

/** CSPRNG one-time MFA recovery codes, shown to the user exactly once (services/api/src/modules/auth/mfa.service.ts's confirm()) - only their hash is ever persisted. */
export function generateRecoveryCodes(count = DEFAULT_COUNT): string[] {
  return Array.from({ length: count }, () => `${randomGroup()}-${randomGroup()}`);
}

/**
 * Plain SHA-256 (no secret needed - same reasoning as
 * session-tokens.ts's refresh token hash: the code's own entropy, ~25 bits
 * per 4-char group over a 32-symbol alphabet, is what a recovery code
 * relies on, not a keyed hash). Normalizes case first, since a code
 * displayed in uppercase is easy for a user to retype in lowercase.
 */
export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(code.toUpperCase(), 'utf8').digest('hex');
}
