import { decrypt, encrypt } from '../../lib/symmetric-crypto';
import { generateRecoveryCodes, hashRecoveryCode } from './mfa-crypto';
import { computeTotpCode, generateTotpSecret, totpUri, verifyTotpCode } from './totp';
import type { MfaStatus } from '@taavon/database';

const ISSUER = 'Taavon-Afarini';

export class NoPendingEnrollmentError extends Error {
  constructor() {
    super('No pending MFA enrollment to confirm - call enroll first.');
    this.name = 'NoPendingEnrollmentError';
  }
}

export class InvalidTotpCodeError extends Error {
  constructor() {
    super('The provided code is incorrect.');
    this.name = 'InvalidTotpCodeError';
  }
}

export class MfaNotActiveError extends Error {
  constructor() {
    super('MFA is not active for this account.');
    this.name = 'MfaNotActiveError';
  }
}

export interface MfaEnrollmentRecord {
  status: MfaStatus;
  secretCiphertext: string;
}

export interface MfaRepository {
  findEnrollment(userId: string): Promise<MfaEnrollmentRecord | null>;
  /** Creates or replaces the user's enrollment as PENDING with a new secret - also discards any recovery codes tied to a prior enrollment, so re-enrolling can never leave old codes valid against the new secret. */
  upsertPendingEnrollment(userId: string, secretCiphertext: string): Promise<void>;
  /** Marks the (already-PENDING) enrollment ACTIVE and stores the given recovery-code hashes, atomically. */
  activateEnrollment(userId: string, recoveryCodeHashes: string[]): Promise<void>;
  findUnusedRecoveryCodeByHash(userId: string, codeHash: string): Promise<{ id: string } | null>;
  markRecoveryCodeUsed(id: string): Promise<void>;
}

export interface EnrollMfaResult {
  secretBase32: string;
  otpauthUri: string;
}

/**
 * Starts (or restarts) enrollment: a fresh secret, stored encrypted and
 * PENDING - never ACTIVE until confirmMfa() proves the user can actually
 * generate a matching code (Task 09 acceptance: "enrollment ناقص secret
 * فعال ندارد"). Whether re-enrolling over an already-ACTIVE MFA setup
 * should itself require a fresh challenge is a route-level (request-scoped)
 * decision - see mfa.route.ts - not this function's concern.
 */
export async function enrollMfa(repo: MfaRepository, encryptionKey: string, userId: string): Promise<EnrollMfaResult> {
  const secretBase32 = generateTotpSecret();
  await repo.upsertPendingEnrollment(userId, encrypt(secretBase32, encryptionKey));
  return { secretBase32, otpauthUri: totpUri(secretBase32, userId, ISSUER) };
}

export interface ConfirmMfaResult {
  /** Shown to the caller exactly once - only hashes are ever persisted. */
  recoveryCodes: string[];
}

export async function confirmMfa(
  repo: MfaRepository,
  encryptionKey: string,
  userId: string,
  code: string
): Promise<ConfirmMfaResult> {
  const enrollment = await repo.findEnrollment(userId);
  if (!enrollment || enrollment.status !== 'PENDING') {
    throw new NoPendingEnrollmentError();
  }

  const secretBase32 = decrypt(enrollment.secretCiphertext, encryptionKey);
  if (!verifyTotpCode(secretBase32, code)) {
    throw new InvalidTotpCodeError();
  }

  const recoveryCodes = generateRecoveryCodes();
  await repo.activateEnrollment(userId, recoveryCodes.map(hashRecoveryCode));
  return { recoveryCodes };
}

/**
 * Verifies a second-factor challenge: a live TOTP code first, falling back
 * to a recovery code (single-use - consumed on success). Returns a plain
 * boolean rather than throwing for "wrong code", matching the
 * non-enumerating spirit of Task 06's OTP verify (a bad TOTP code and a
 * bad recovery code look identical to the caller either way).
 */
export async function challengeMfa(
  repo: MfaRepository,
  encryptionKey: string,
  userId: string,
  code: string
): Promise<boolean> {
  const enrollment = await repo.findEnrollment(userId);
  if (!enrollment || enrollment.status !== 'ACTIVE') {
    throw new MfaNotActiveError();
  }

  const secretBase32 = decrypt(enrollment.secretCiphertext, encryptionKey);
  if (verifyTotpCode(secretBase32, code)) return true;

  const recoveryMatch = await repo.findUnusedRecoveryCodeByHash(userId, hashRecoveryCode(code));
  if (recoveryMatch) {
    await repo.markRecoveryCodeUsed(recoveryMatch.id);
    return true;
  }

  return false;
}

/** Whether the user has a confirmed, usable MFA enrollment - used to decide whether re-enrolling needs a fresh challenge first (mfa.route.ts). */
export async function hasActiveMfa(repo: MfaRepository, userId: string): Promise<boolean> {
  const enrollment = await repo.findEnrollment(userId);
  return enrollment?.status === 'ACTIVE';
}
