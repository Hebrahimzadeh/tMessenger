import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { getPrisma } from '@taavon/database';
import { bootstrapSuperadmin, SuperadminRoleNotSeededError } from './bootstrap';
import { hashPhone } from './phone-crypto';

const PHONE_ENCRYPTION_KEY = 'test-only-bootstrap-phone-encryption-key';

// Real Postgres only (getPrisma() needs DATABASE_URL, and bootstrapSuperadmin
// exercises real foreign keys - the roles table must actually be seeded).
// Gated on a live probe, same pattern as storage.test.ts's S3 contract:
// `npm run test` never hard-fails without `docker compose up -d`, but
// `npm run test:integration` genuinely exercises it wherever Postgres is up.
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

describe.skipIf(!databaseAvailable)('bootstrapSuperadmin (real Postgres)', () => {
  const createdUserIds: string[] = [];

  afterEach(async () => {
    const prisma = getPrisma();
    // FK-safe teardown order: role_assignments/audit_events/phone_identities
    // all reference users with onDelete: Restrict, so users must be deleted
    // last.
    for (const userId of createdUserIds.splice(0)) {
      await prisma.auditEvent.deleteMany({ where: { targetId: userId } });
      await prisma.roleAssignment.deleteMany({ where: { OR: [{ userId }, { assignedBy: userId }] } });
      await prisma.phoneIdentity.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
  });

  it('creates exactly one user and one global SUPERADMIN role assignment', async () => {
    const prisma = getPrisma();
    const phoneE164 = `+1555${randomUUID().replace(/-/g, '').slice(0, 7)}`;

    const result = await bootstrapSuperadmin(prisma, phoneE164, PHONE_ENCRYPTION_KEY);
    createdUserIds.push(result.userId);

    expect(result.created).toBe(true);
    expect(result.roleAssigned).toBe(true);

    const users = await prisma.phoneIdentity.count({ where: { userId: result.userId } });
    expect(users).toBe(1);

    const role = await prisma.role.findUniqueOrThrow({ where: { key: 'SUPERADMIN' } });
    const assignments = await prisma.roleAssignment.count({
      where: { userId: result.userId, roleId: role.id, scopeType: 'GLOBAL', scopeId: null },
    });
    expect(assignments).toBe(1);
  });

  it('never stores the phone number in plaintext', async () => {
    const prisma = getPrisma();
    const phoneE164 = `+1555${randomUUID().replace(/-/g, '').slice(0, 7)}`;

    const result = await bootstrapSuperadmin(prisma, phoneE164, PHONE_ENCRYPTION_KEY);
    createdUserIds.push(result.userId);

    const identity = await prisma.phoneIdentity.findUniqueOrThrow({ where: { userId: result.userId } });
    expect(identity.phoneCiphertext).not.toContain(phoneE164);
    expect(identity.phoneHash).toBe(hashPhone(phoneE164, PHONE_ENCRYPTION_KEY));
  });

  it('writes an audit event on the first, creating run', async () => {
    const prisma = getPrisma();
    const phoneE164 = `+1555${randomUUID().replace(/-/g, '').slice(0, 7)}`;

    const result = await bootstrapSuperadmin(prisma, phoneE164, PHONE_ENCRYPTION_KEY);
    createdUserIds.push(result.userId);

    const events = await prisma.auditEvent.findMany({ where: { targetId: result.userId } });
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]?.action).toBe('auth.bootstrap_superadmin');
  });

  it('running it twice is idempotent: same user, no duplicate role assignment, second run audits nothing new', async () => {
    const prisma = getPrisma();
    const phoneE164 = `+1555${randomUUID().replace(/-/g, '').slice(0, 7)}`;

    const first = await bootstrapSuperadmin(prisma, phoneE164, PHONE_ENCRYPTION_KEY);
    createdUserIds.push(first.userId);
    const second = await bootstrapSuperadmin(prisma, phoneE164, PHONE_ENCRYPTION_KEY);

    expect(second.userId).toBe(first.userId);
    expect(second.created).toBe(false);
    expect(second.roleAssigned).toBe(false);

    const userCount = await prisma.user.count({ where: { id: first.userId } });
    expect(userCount).toBe(1);

    const role = await prisma.role.findUniqueOrThrow({ where: { key: 'SUPERADMIN' } });
    const assignmentCount = await prisma.roleAssignment.count({
      where: { userId: first.userId, roleId: role.id, scopeType: 'GLOBAL', scopeId: null },
    });
    expect(assignmentCount).toBe(1);

    const auditCount = await prisma.auditEvent.count({ where: { targetId: first.userId } });
    expect(auditCount).toBe(1);
  });

});

describe('bootstrapSuperadmin (unit, no real database)', () => {
  it('throws SuperadminRoleNotSeededError when the SUPERADMIN role has not been migrated yet', async () => {
    // Minimal fake satisfying only the calls bootstrap.ts makes before
    // reaching the role lookup - no real Postgres involved, so this runs
    // under plain `npm run test` and doesn't need docker compose up.
    const fakeTx = {
      phoneIdentity: { findUnique: async () => null, create: async () => ({}) },
      user: { create: async () => ({ id: 'fake-user-id' }) },
      role: { findUnique: async () => null },
    };
    const fakePrisma = {
      $transaction: async (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
    };

    await expect(
      bootstrapSuperadmin(
        fakePrisma as unknown as Parameters<typeof bootstrapSuperadmin>[0],
        '+15550000000',
        PHONE_ENCRYPTION_KEY
      )
    ).rejects.toThrow(SuperadminRoleNotSeededError);
  });
});
