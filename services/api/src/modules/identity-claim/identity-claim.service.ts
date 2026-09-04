import type { OfficialIdentityClaimStatus } from '@taavon/database';
import { decrypt, encrypt } from '../../lib/symmetric-crypto';

export class EmptyEvidenceError extends Error {
  constructor() {
    super('Evidence text is required to submit an identity claim.');
    this.name = 'EmptyEvidenceError';
  }
}

export class ClaimNotFoundError extends Error {
  constructor() {
    super('No identity claim exists for this user.');
    this.name = 'ClaimNotFoundError';
  }
}

export interface IdentityClaimRecord {
  status: OfficialIdentityClaimStatus;
}

export interface IdentityClaimRepository {
  findByUserId(userId: string): Promise<IdentityClaimRecord | null>;
  findWithEvidenceByUserId(userId: string): Promise<(IdentityClaimRecord & { evidenceCiphertext: string | null }) | null>;
  /** Creates or replaces the claim as PENDING with new evidence - resubmitting after a REJECTED decision starts a fresh review. */
  upsertPending(userId: string, evidenceCiphertext: string): Promise<void>;
  review(userId: string, status: 'VERIFIED' | 'REJECTED', reviewedBy: string): Promise<void>;
  /** Admin queue - no evidence in this shape (see the detail lookup for that). */
  findPending(): Promise<Array<{ userId: string; status: OfficialIdentityClaimStatus }>>;
}

/**
 * Submits (or resubmits) the caller's own official-identity claim. This is
 * the private, evidence-backed prerequisite Task 09 requires before a
 * non-bootstrap admin role can be granted ("پذیرش مسئولیت مدیریتی برای
 * افراد غیر bootstrap به ثبت و تأیید claim رسمی خصوصی وابسته باشد") - never
 * shown on the public profile (see profile.service.ts's getPublicProfile,
 * untouched by this task, and role-assignment.service.ts's own comment).
 */
export async function submitIdentityClaim(
  repo: IdentityClaimRepository,
  encryptionKey: string,
  userId: string,
  evidence: string
): Promise<void> {
  if (evidence.trim().length === 0) {
    throw new EmptyEvidenceError();
  }
  await repo.upsertPending(userId, encrypt(evidence, encryptionKey));
}

export async function reviewIdentityClaim(
  repo: IdentityClaimRepository,
  userId: string,
  decision: 'VERIFIED' | 'REJECTED',
  reviewedBy: string
): Promise<void> {
  const claim = await repo.findByUserId(userId);
  if (!claim) throw new ClaimNotFoundError();
  await repo.review(userId, decision, reviewedBy);
}

export async function listPendingClaims(
  repo: IdentityClaimRepository
): Promise<Array<{ userId: string; status: OfficialIdentityClaimStatus }>> {
  return repo.findPending();
}

export interface ClaimForReview {
  status: OfficialIdentityClaimStatus;
  evidence: string | null;
}

/** Decrypts the evidence for an admin actively reviewing a claim - admin tooling only, never the public profile (see this module's own header comment). */
export async function getClaimForReview(
  repo: IdentityClaimRepository,
  encryptionKey: string,
  userId: string
): Promise<ClaimForReview> {
  const claim = await repo.findWithEvidenceByUserId(userId);
  if (!claim) throw new ClaimNotFoundError();

  return {
    status: claim.status,
    evidence: claim.evidenceCiphertext ? decrypt(claim.evidenceCiphertext, encryptionKey) : null,
  };
}
