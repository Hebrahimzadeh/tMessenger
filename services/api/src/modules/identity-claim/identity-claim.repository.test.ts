import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@taavon/database';
import { createPrismaIdentityClaimRepository } from './identity-claim.repository';

async function probeDatabaseAvailability(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 3000));
    const probe = getPrisma().$queryRaw`SELECT 1`.then(() => 'ok' as const);
    return (await Promise.race([probe, timeout])) === 'ok';
  } catch {
    return false;
  }
}

const databaseAvailable = await probeDatabaseAvailability();

describe.skipIf(!databaseAvailable)('IdentityClaimRepository: real Postgres', () => {
  let userId: string;
  let reviewerId: string;

  beforeAll(async () => {
    const user = await getPrisma().user.create({ data: {} });
    const reviewer = await getPrisma().user.create({ data: {} });
    userId = user.id;
    reviewerId = reviewer.id;
  });

  afterEach(async () => {
    await getPrisma().officialIdentityClaim.deleteMany({ where: { userId } });
  });

  afterAll(async () => {
    await getPrisma().user.deleteMany({ where: { id: { in: [userId, reviewerId] } } });
  });

  it('findByUserId returns null before submitting, then PENDING after', async () => {
    const repo = createPrismaIdentityClaimRepository(getPrisma());
    await expect(repo.findByUserId(userId)).resolves.toBeNull();

    await repo.upsertPending(userId, 'fake-ciphertext');
    await expect(repo.findByUserId(userId)).resolves.toEqual({ status: 'PENDING' });
  });

  it('upsertPending replaces an existing claim rather than creating a second row, and clears prior review fields', async () => {
    const repo = createPrismaIdentityClaimRepository(getPrisma());
    await repo.upsertPending(userId, 'first-evidence');
    await repo.review(userId, 'REJECTED', reviewerId);
    await repo.upsertPending(userId, 'second-evidence');

    const count = await getPrisma().officialIdentityClaim.count({ where: { userId } });
    expect(count).toBe(1);

    const raw = await getPrisma().officialIdentityClaim.findUnique({ where: { userId } });
    expect(raw?.status).toBe('PENDING');
    expect(raw?.reviewedBy).toBeNull();
    expect(raw?.reviewedAt).toBeNull();
    expect(raw?.evidenceCiphertext).toBe('second-evidence');
  });

  it('review sets status, reviewedBy, and reviewedAt', async () => {
    const repo = createPrismaIdentityClaimRepository(getPrisma());
    await repo.upsertPending(userId, 'evidence');
    await repo.review(userId, 'VERIFIED', reviewerId);

    const raw = await getPrisma().officialIdentityClaim.findUnique({ where: { userId } });
    expect(raw?.status).toBe('VERIFIED');
    expect(raw?.reviewedBy).toBe(reviewerId);
    expect(raw?.reviewedAt).not.toBeNull();
  });

  it('findWithEvidenceByUserId returns the ciphertext for admin review', async () => {
    const repo = createPrismaIdentityClaimRepository(getPrisma());
    await repo.upsertPending(userId, 'real-ciphertext-value');
    await expect(repo.findWithEvidenceByUserId(userId)).resolves.toEqual({
      status: 'PENDING',
      evidenceCiphertext: 'real-ciphertext-value',
    });
  });
});
