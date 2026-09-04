import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@taavon/database';
import { createPrismaProfileRepository, createPrismaPublicProfileRepository } from './profile.repository';

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

describe.skipIf(!databaseAvailable)('Profile repositories: real Postgres', () => {
  let userId: string;
  let otherUserId: string;

  beforeAll(async () => {
    const prisma = getPrisma();
    const user = await prisma.user.create({ data: {} });
    const other = await prisma.user.create({ data: {} });
    userId = user.id;
    otherUserId = other.id;
  });

  afterEach(async () => {
    await getPrisma().userProfile.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
  });

  afterAll(async () => {
    await getPrisma().user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
  });

  it('findByUserId returns null before any profile exists, then the saved record after', async () => {
    const repo = createPrismaProfileRepository(getPrisma());
    await expect(repo.findByUserId(userId)).resolves.toBeNull();

    await repo.save({ userId, username: 'ali_2000', displayName: 'علی', bio: 'سلام', phoneVisibility: 'PRIVATE' });

    await expect(repo.findByUserId(userId)).resolves.toEqual({
      userId,
      username: 'ali_2000',
      displayName: 'علی',
      bio: 'سلام',
      phoneVisibility: 'PRIVATE',
    });
  });

  it('save() upserts - a second save updates the same row rather than creating a duplicate', async () => {
    const repo = createPrismaProfileRepository(getPrisma());
    await repo.save({ userId, username: 'ali_2000', displayName: 'علی', bio: null, phoneVisibility: 'PRIVATE' });
    await repo.save({ userId, username: 'ali_2000', displayName: 'علی رضا', bio: 'بیو جدید', phoneVisibility: 'PUBLIC' });

    const count = await getPrisma().userProfile.count({ where: { userId } });
    expect(count).toBe(1);
    await expect(repo.findByUserId(userId)).resolves.toMatchObject({ displayName: 'علی رضا', bio: 'بیو جدید', phoneVisibility: 'PUBLIC' });
  });

  it('isUsernameTaken is case-insensitive-safe in practice (always compared against a stored-lowercase value) and excludes the given user', async () => {
    const repo = createPrismaProfileRepository(getPrisma());
    await repo.save({ userId: otherUserId, username: 'taken_name', displayName: 'دیگری', bio: null, phoneVisibility: 'PRIVATE' });

    await expect(repo.isUsernameTaken('taken_name', userId)).resolves.toBe(true);
    await expect(repo.isUsernameTaken('taken_name', otherUserId)).resolves.toBe(false);
    await expect(repo.isUsernameTaken('never_used_name', userId)).resolves.toBe(false);
  });

  it('the DB-level functional unique index on lower(username) rejects a real collision even if application logic is bypassed', async () => {
    const prisma = getPrisma();
    await prisma.userProfile.create({
      data: { userId, username: 'clash_name', displayName: 'اول', phoneVisibility: 'PRIVATE' },
    });

    await expect(
      prisma.userProfile.create({
        data: { userId: otherUserId, username: 'CLASH_NAME', displayName: 'دوم', phoneVisibility: 'PRIVATE' },
      })
    ).rejects.toThrow();
  });

  it('findPublicByUsername returns the phone ciphertext alongside profile fields for later decryption by the service', async () => {
    const prisma = getPrisma();
    await prisma.phoneIdentity.create({
      data: { userId, phoneHash: `hash-${userId}`, phoneCiphertext: 'fake-ciphertext', verifiedAt: new Date() },
    });
    await prisma.userProfile.create({
      data: { userId, username: 'ali_2000', displayName: 'علی', phoneVisibility: 'PUBLIC' },
    });

    const publicRepo = createPrismaPublicProfileRepository(prisma);
    const result = await publicRepo.findPublicByUsername('ali_2000');

    expect(result).toEqual({
      username: 'ali_2000',
      displayName: 'علی',
      bio: null,
      phoneVisibility: 'PUBLIC',
      phoneCiphertext: 'fake-ciphertext',
    });

    await prisma.phoneIdentity.deleteMany({ where: { userId } });
  });

  it('findPublicByUsername returns null phoneCiphertext when the user has no phone identity', async () => {
    const prisma = getPrisma();
    await prisma.userProfile.create({
      data: { userId, username: 'no_phone_user', displayName: 'بی‌شماره', phoneVisibility: 'PUBLIC' },
    });

    const publicRepo = createPrismaPublicProfileRepository(prisma);
    const result = await publicRepo.findPublicByUsername('no_phone_user');
    expect(result?.phoneCiphertext).toBeNull();
  });

  it('findPublicByUsername returns null for a username nobody has', async () => {
    const publicRepo = createPrismaPublicProfileRepository(getPrisma());
    await expect(publicRepo.findPublicByUsername('nobody_at_all_xyz')).resolves.toBeNull();
  });
});
