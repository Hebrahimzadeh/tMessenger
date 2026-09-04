import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@taavon/database';
import { createPrismaMfaRepository } from './mfa.repository';

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

describe.skipIf(!databaseAvailable)('MfaRepository: real Postgres', () => {
  let userId: string;

  beforeAll(async () => {
    const user = await getPrisma().user.create({ data: {} });
    userId = user.id;
  });

  afterEach(async () => {
    const prisma = getPrisma();
    const enrollment = await prisma.mfaEnrollment.findUnique({ where: { userId } });
    if (enrollment) {
      await prisma.mfaRecoveryCode.deleteMany({ where: { enrollmentId: enrollment.id } });
      await prisma.mfaEnrollment.delete({ where: { userId } });
    }
  });

  afterAll(async () => {
    await getPrisma().user.deleteMany({ where: { id: userId } });
  });

  it('findEnrollment returns null before enrolling, then the PENDING record after', async () => {
    const repo = createPrismaMfaRepository(getPrisma());
    await expect(repo.findEnrollment(userId)).resolves.toBeNull();

    await repo.upsertPendingEnrollment(userId, 'fake-ciphertext');
    await expect(repo.findEnrollment(userId)).resolves.toEqual({ status: 'PENDING', secretCiphertext: 'fake-ciphertext' });
  });

  it('upsertPendingEnrollment called twice replaces the row rather than creating a second one', async () => {
    const repo = createPrismaMfaRepository(getPrisma());
    await repo.upsertPendingEnrollment(userId, 'first-secret');
    await repo.upsertPendingEnrollment(userId, 'second-secret');

    const count = await getPrisma().mfaEnrollment.count({ where: { userId } });
    expect(count).toBe(1);
    await expect(repo.findEnrollment(userId)).resolves.toMatchObject({ secretCiphertext: 'second-secret' });
  });

  it('re-enrolling discards recovery codes tied to the previous secret', async () => {
    const repo = createPrismaMfaRepository(getPrisma());
    await repo.upsertPendingEnrollment(userId, 'first-secret');
    await repo.activateEnrollment(userId, ['hash-a', 'hash-b']);
    await expect(repo.findUnusedRecoveryCodeByHash(userId, 'hash-a')).resolves.not.toBeNull();

    await repo.upsertPendingEnrollment(userId, 'second-secret');

    await expect(repo.findUnusedRecoveryCodeByHash(userId, 'hash-a')).resolves.toBeNull();
  });

  it('activateEnrollment sets ACTIVE and stores recovery code hashes atomically', async () => {
    const repo = createPrismaMfaRepository(getPrisma());
    await repo.upsertPendingEnrollment(userId, 'a-secret');
    await repo.activateEnrollment(userId, ['hash-1', 'hash-2', 'hash-3']);

    await expect(repo.findEnrollment(userId)).resolves.toMatchObject({ status: 'ACTIVE' });
    await expect(repo.findUnusedRecoveryCodeByHash(userId, 'hash-2')).resolves.not.toBeNull();
  });

  it('markRecoveryCodeUsed makes a code no longer findable as unused (single-use)', async () => {
    const repo = createPrismaMfaRepository(getPrisma());
    await repo.upsertPendingEnrollment(userId, 'a-secret');
    await repo.activateEnrollment(userId, ['hash-1']);

    const match = await repo.findUnusedRecoveryCodeByHash(userId, 'hash-1');
    expect(match).not.toBeNull();
    await repo.markRecoveryCodeUsed(match!.id);

    await expect(repo.findUnusedRecoveryCodeByHash(userId, 'hash-1')).resolves.toBeNull();
  });

  it('findUnusedRecoveryCodeByHash returns null for a user with no enrollment at all', async () => {
    const repo = createPrismaMfaRepository(getPrisma());
    const otherUser = await getPrisma().user.create({ data: {} });
    await expect(repo.findUnusedRecoveryCodeByHash(otherUser.id, 'hash-1')).resolves.toBeNull();
    await getPrisma().user.delete({ where: { id: otherUser.id } });
  });
});
