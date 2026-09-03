import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@taavon/database';
import { FakeSessionRepository } from './fake-session-repository';
import { createPrismaSessionRepository, type NewSession, type SessionRepository } from './session.repository';

function newSessionFor(userId: string, overrides: Partial<NewSession> = {}): NewSession {
  return {
    userId,
    tokenFamilyId: randomUUID(),
    refreshHash: randomUUID().replace(/-/g, ''),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    ...overrides,
  };
}

function sessionRepositoryContract(name: string, getRepo: () => SessionRepository, getUserId: () => string) {
  it(`${name}: create then findByRefreshHash returns the same session`, async () => {
    const repo = getRepo();
    const input = newSessionFor(getUserId());
    const created = await repo.create(input);

    expect(created.revokedAt).toBeNull();

    const found = await repo.findByRefreshHash(input.refreshHash);
    expect(found?.id).toBe(created.id);
    expect(found?.tokenFamilyId).toBe(input.tokenFamilyId);
  });

  it(`${name}: findByRefreshHash returns null for a hash that was never stored`, async () => {
    await expect(getRepo().findByRefreshHash(`never-stored-${randomUUID()}`)).resolves.toBeNull();
  });

  it(`${name}: revoke sets revokedAt and is idempotent (does not overwrite an existing timestamp)`, async () => {
    const repo = getRepo();
    const created = await repo.create(newSessionFor(getUserId()));

    await repo.revoke(created.id);
    const firstRevoke = await repo.findByRefreshHash(created.refreshHash);
    expect(firstRevoke?.revokedAt).not.toBeNull();

    await repo.revoke(created.id);
    const secondRevoke = await repo.findByRefreshHash(created.refreshHash);
    expect(secondRevoke?.revokedAt?.getTime()).toBe(firstRevoke?.revokedAt?.getTime());
  });

  it(`${name}: revokeFamily revokes every session in the family and none outside it`, async () => {
    const repo = getRepo();
    const userId = getUserId();
    const familyId = randomUUID();
    const otherFamilyId = randomUUID();

    const first = await repo.create(newSessionFor(userId, { tokenFamilyId: familyId }));
    const rotated = await repo.create(newSessionFor(userId, { tokenFamilyId: familyId }));
    const unrelated = await repo.create(newSessionFor(userId, { tokenFamilyId: otherFamilyId }));

    await repo.revokeFamily(familyId);

    expect((await repo.findByRefreshHash(first.refreshHash))?.revokedAt).not.toBeNull();
    expect((await repo.findByRefreshHash(rotated.refreshHash))?.revokedAt).not.toBeNull();
    expect((await repo.findByRefreshHash(unrelated.refreshHash))?.revokedAt).toBeNull();
  });
}

describe('SessionRepository contract: fake', () => {
  sessionRepositoryContract('fake', () => new FakeSessionRepository(), () => randomUUID());
});

// Real Postgres only - needs a real User row (FK, onDelete: Restrict).
// Gated on a live probe, same pattern as bootstrap.test.ts/storage.test.ts.
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

describe.skipIf(!databaseAvailable)('SessionRepository contract: real Postgres', () => {
  let userId: string;

  beforeAll(async () => {
    const user = await getPrisma().user.create({ data: {} });
    userId = user.id;
  });

  afterEach(async () => {
    // Sessions accumulate across the contract's own tests (each creates new
    // ones under the same shared user) - clear them between tests so
    // revoke/revokeFamily assertions never see a stale session from a
    // previous test in this same file.
    await getPrisma().session.deleteMany({ where: { userId } });
  });

  afterAll(async () => {
    await getPrisma().user.deleteMany({ where: { id: userId } });
  });

  sessionRepositoryContract('postgres', () => createPrismaSessionRepository(getPrisma()), () => userId);
});
