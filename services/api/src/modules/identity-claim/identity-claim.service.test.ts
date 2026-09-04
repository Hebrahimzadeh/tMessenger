import { describe, expect, it } from 'vitest';
import {
  ClaimNotFoundError,
  EmptyEvidenceError,
  getClaimForReview,
  reviewIdentityClaim,
  submitIdentityClaim,
  type IdentityClaimRecord,
  type IdentityClaimRepository,
} from './identity-claim.service';

const ENCRYPTION_KEY = 'test-only-identity-claim-encryption-key';

function fakeClaimRepo(seed: Record<string, IdentityClaimRecord & { evidenceCiphertext: string | null }> = {}) {
  const claims = new Map(Object.entries(seed));
  const repo: IdentityClaimRepository = {
    async findByUserId(userId) {
      const c = claims.get(userId);
      return c ? { status: c.status } : null;
    },
    async findWithEvidenceByUserId(userId) {
      return claims.get(userId) ?? null;
    },
    async upsertPending(userId, evidenceCiphertext) {
      claims.set(userId, { status: 'PENDING', evidenceCiphertext });
    },
    async review(userId, status) {
      const c = claims.get(userId);
      if (c) c.status = status;
    },
    async findPending() {
      return [...claims.entries()]
        .filter(([, c]) => c.status === 'PENDING')
        .map(([userId, c]) => ({ userId, status: c.status }));
    },
  };
  return { repo, claims };
}

describe('submitIdentityClaim', () => {
  it('stores the evidence encrypted, as a PENDING claim', async () => {
    const { repo, claims } = fakeClaimRepo();
    await submitIdentityClaim(repo, ENCRYPTION_KEY, 'user-1', 'من مدیر رسمی سازمان X هستم.');

    const stored = claims.get('user-1');
    expect(stored?.status).toBe('PENDING');
    expect(stored?.evidenceCiphertext).not.toContain('من مدیر رسمی سازمان X هستم.');
  });

  it('rejects empty evidence', async () => {
    const { repo } = fakeClaimRepo();
    await expect(submitIdentityClaim(repo, ENCRYPTION_KEY, 'user-1', '   ')).rejects.toThrow(EmptyEvidenceError);
  });

  it('resubmitting resets a previously REJECTED claim back to PENDING', async () => {
    const { repo, claims } = fakeClaimRepo({ 'user-1': { status: 'REJECTED', evidenceCiphertext: 'old' } });
    await submitIdentityClaim(repo, ENCRYPTION_KEY, 'user-1', 'مدرک جدید');
    expect(claims.get('user-1')?.status).toBe('PENDING');
  });
});

describe('reviewIdentityClaim', () => {
  it('marks a PENDING claim VERIFIED', async () => {
    const { repo, claims } = fakeClaimRepo({ 'user-1': { status: 'PENDING', evidenceCiphertext: 'evidence' } });
    await reviewIdentityClaim(repo, 'user-1', 'VERIFIED', 'admin-1');
    expect(claims.get('user-1')?.status).toBe('VERIFIED');
  });

  it('marks a PENDING claim REJECTED', async () => {
    const { repo, claims } = fakeClaimRepo({ 'user-1': { status: 'PENDING', evidenceCiphertext: 'evidence' } });
    await reviewIdentityClaim(repo, 'user-1', 'REJECTED', 'admin-1');
    expect(claims.get('user-1')?.status).toBe('REJECTED');
  });

  it('throws ClaimNotFoundError when the user never submitted a claim', async () => {
    const { repo } = fakeClaimRepo();
    await expect(reviewIdentityClaim(repo, 'user-1', 'VERIFIED', 'admin-1')).rejects.toThrow(ClaimNotFoundError);
  });
});

describe('getClaimForReview', () => {
  it('returns the decrypted evidence for an admin reviewing the claim', async () => {
    const { repo } = fakeClaimRepo();
    await submitIdentityClaim(repo, ENCRYPTION_KEY, 'user-1', 'این مدرک من است.');

    const result = await getClaimForReview(repo, ENCRYPTION_KEY, 'user-1');
    expect(result).toEqual({ status: 'PENDING', evidence: 'این مدرک من است.' });
  });

  it('throws ClaimNotFoundError for a user with no claim', async () => {
    const { repo } = fakeClaimRepo();
    await expect(getClaimForReview(repo, ENCRYPTION_KEY, 'user-1')).rejects.toThrow(ClaimNotFoundError);
  });
});
