import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@taavon/database';
import { createPrismaSpaceRepository } from './space.repository';

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

const TWO_PRIMARY_ROLES = [
  { key: 'organizer', title: 'سازمان‌دهنده', isPrimary: true },
  { key: 'contributor', title: 'همکار', isPrimary: true },
];

describe.skipIf(!databaseAvailable)('SpaceRepository: real Postgres', () => {
  let userId: string;
  let otherUserId: string;
  let spaceAdminRoleId: string;

  beforeAll(async () => {
    const user = await getPrisma().user.create({ data: {} });
    const other = await getPrisma().user.create({ data: {} });
    userId = user.id;
    otherUserId = other.id;

    const role = await getPrisma().role.upsert({
      where: { key: 'SPACE_ADMIN' },
      create: { key: 'SPACE_ADMIN', displayName: 'Space Admin' },
      update: {},
    });
    spaceAdminRoleId = role.id;
  });

  afterEach(async () => {
    // Children first - Space's own FKs are all onDelete: Restrict.
    await getPrisma().spaceRoleMembership.deleteMany({ where: { user: { id: { in: [userId, otherUserId] } } } });
    await getPrisma().spaceInvite.deleteMany({ where: { createdBy: { in: [userId, otherUserId] } } });
    await getPrisma().roleAssignment.deleteMany({ where: { userId: { in: [userId, otherUserId] }, scopeType: 'SPACE' } });
    const spaceIds = (await getPrisma().space.findMany({ where: { creatorId: { in: [userId, otherUserId] } }, select: { id: true } })).map(
      (s) => s.id
    );
    await getPrisma().spaceParticipationRole.deleteMany({ where: { spaceId: { in: spaceIds } } });
    await getPrisma().spaceDefinitionVersion.deleteMany({ where: { spaceId: { in: spaceIds } } });
    await getPrisma().outboxEvent.deleteMany({ where: { aggregateId: { in: spaceIds } } });
    await getPrisma().space.deleteMany({ where: { id: { in: spaceIds } } });
  });

  afterAll(async () => {
    await getPrisma().user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
  });

  it('createDraft creates the space, its version-1 row, and a space.created outbox event', async () => {
    const repo = createPrismaSpaceRepository(getPrisma());
    const { id } = await repo.createDraft({ title: 'باغ محله', slug: 'baagh-mahalle-test', policyVersion: 1, creatorId: userId });

    const found = await repo.findById(id);
    expect(found?.status).toBe('DRAFT');
    expect(found?.latestVersion.versionNumber).toBe(1);
    expect(found?.latestVersion.title).toBe('باغ محله');

    const event = await getPrisma().outboxEvent.findFirst({ where: { aggregateId: id, eventType: 'space.created' } });
    expect(event).not.toBeNull();
    expect(event?.payload).toMatchObject({ spaceId: id, slug: 'baagh-mahalle-test' });
  });

  it('slugExists reflects real uniqueness', async () => {
    const repo = createPrismaSpaceRepository(getPrisma());
    await expect(repo.slugExists('baagh-mahalle-test-2')).resolves.toBe(false);
    await repo.createDraft({ title: 'x', slug: 'baagh-mahalle-test-2', policyVersion: 1, creatorId: userId });
    await expect(repo.slugExists('baagh-mahalle-test-2')).resolves.toBe(true);
  });

  it('findBySlug returns the same record as findById', async () => {
    const repo = createPrismaSpaceRepository(getPrisma());
    const { id } = await repo.createDraft({ title: 'باغ محله', slug: 'baagh-mahalle-slug-test', policyVersion: 1, creatorId: userId });
    const bySlug = await repo.findBySlug('baagh-mahalle-slug-test');
    expect(bySlug?.id).toBe(id);
  });

  it('createNewVersion upserts roles (stable id across versions for the same key), snapshots primary/supplementary ids, resets status to DRAFT, and appends a space.versioned event', async () => {
    const repo = createPrismaSpaceRepository(getPrisma());
    const { id } = await repo.createDraft({ title: 'باغ محله', slug: 'baagh-mahalle-version-test', policyVersion: 1, creatorId: userId });

    const v2 = await repo.createNewVersion({
      spaceId: id,
      title: 'باغ محله',
      purpose: 'purpose v2',
      participationMethods: ['حضوری'],
      roles: TWO_PRIMARY_ROLES,
      policyVersion: 1,
      createdBy: userId,
    });
    expect(v2.versionNumber).toBe(2);

    const afterV2 = await repo.findById(id);
    expect(afterV2?.roles).toHaveLength(2);
    const organizerId = afterV2!.roles.find((r) => r.key === 'organizer')!.id;
    expect(afterV2?.latestVersion.primaryRoleIds).toContain(organizerId);

    // Editing again with the same role key must reuse the same role id, not create a duplicate.
    const v3 = await repo.createNewVersion({
      spaceId: id,
      title: 'باغ محله (ویرایش)',
      purpose: 'purpose v3',
      participationMethods: ['حضوری', 'آنلاین'],
      roles: [{ key: 'organizer', title: 'سازمان‌دهنده (به‌روزشده)', isPrimary: true }, TWO_PRIMARY_ROLES[1]!],
      policyVersion: 1,
      createdBy: userId,
    });
    expect(v3.versionNumber).toBe(3);

    const afterV3 = await repo.findById(id);
    expect(afterV3?.roles).toHaveLength(2); // still 2, not 3 - the key was reused
    expect(afterV3?.roles.find((r) => r.key === 'organizer')?.id).toBe(organizerId);
    expect(afterV3?.roles.find((r) => r.key === 'organizer')?.title).toBe('سازمان‌دهنده (به‌روزشده)');
    expect(afterV3?.status).toBe('DRAFT');

    const events = await getPrisma().outboxEvent.findMany({ where: { aggregateId: id, eventType: 'space.versioned' } });
    expect(events).toHaveLength(2);
  });

  it('setGateVerdict persists the verdict/reason onto the exact version and updates the space status', async () => {
    const repo = createPrismaSpaceRepository(getPrisma());
    const { id } = await repo.createDraft({ title: 'باغ محله', slug: 'baagh-mahalle-gate-test', policyVersion: 1, creatorId: userId });

    await repo.setGateVerdict(id, 1, 'ALLOW', 'looks fine', 'DRAFT');
    const found = await repo.findById(id);
    expect(found?.latestVersion.gateVerdict).toBe('ALLOW');
    expect(found?.latestVersion.gateReason).toBe('looks fine');
    expect(found?.status).toBe('DRAFT');
  });

  it('publish sets status/publishedAt and appends a space.published outbox event', async () => {
    const repo = createPrismaSpaceRepository(getPrisma());
    const { id } = await repo.createDraft({ title: 'باغ محله', slug: 'baagh-mahalle-publish-test', policyVersion: 1, creatorId: userId });

    const { publishedAt } = await repo.publish(id);
    const found = await repo.findById(id);
    expect(found?.status).toBe('PUBLISHED');
    expect(found?.publishedAt?.getTime()).toBe(publishedAt.getTime());

    const event = await getPrisma().outboxEvent.findFirst({ where: { aggregateId: id, eventType: 'space.published' } });
    expect(event).not.toBeNull();
  });

  it('archive sets status/archivedAt', async () => {
    const repo = createPrismaSpaceRepository(getPrisma());
    const { id } = await repo.createDraft({ title: 'باغ محله', slug: 'baagh-mahalle-archive-test', policyVersion: 1, creatorId: userId });

    const { archivedAt } = await repo.archive(id);
    const found = await repo.findById(id);
    expect(found?.status).toBe('ARCHIVED');
    expect(found?.archivedAt?.getTime()).toBe(archivedAt.getTime());
  });

  it('hasSpaceAdminRole reflects a real SPACE-scoped RoleAssignment row, and is false for a GLOBAL-scoped one', async () => {
    const repo = createPrismaSpaceRepository(getPrisma());
    const { id } = await repo.createDraft({ title: 'باغ محله', slug: 'baagh-mahalle-admin-test', policyVersion: 1, creatorId: userId });

    await expect(repo.hasSpaceAdminRole(otherUserId, id)).resolves.toBe(false);

    await getPrisma().roleAssignment.create({
      data: { userId: otherUserId, roleId: spaceAdminRoleId, scopeType: 'SPACE', scopeId: id, assignedBy: userId },
    });
    await expect(repo.hasSpaceAdminRole(otherUserId, id)).resolves.toBe(true);
    // A different space's scope must not match.
    await expect(repo.hasSpaceAdminRole(otherUserId, '00000000-0000-4000-8000-000000000000')).resolves.toBe(false);
  });

  it('findRoleInSpace only matches a role that actually belongs to that space', async () => {
    const repo = createPrismaSpaceRepository(getPrisma());
    const { id: spaceA } = await repo.createDraft({ title: 'A', slug: 'baagh-mahalle-role-a', policyVersion: 1, creatorId: userId });
    const { id: spaceB } = await repo.createDraft({ title: 'B', slug: 'baagh-mahalle-role-b', policyVersion: 1, creatorId: userId });
    await repo.createNewVersion({
      spaceId: spaceA,
      title: 'A',
      purpose: 'p',
      participationMethods: ['حضوری'],
      roles: TWO_PRIMARY_ROLES,
      policyVersion: 1,
      createdBy: userId,
    });
    const roleId = (await repo.findById(spaceA))!.roles[0]!.id;

    await expect(repo.findRoleInSpace(spaceA, roleId)).resolves.toEqual({ id: roleId });
    await expect(repo.findRoleInSpace(spaceB, roleId)).resolves.toBeNull();
  });

  it('joinRole is idempotent (upsert) and leaveRole is idempotent (deleteMany)', async () => {
    const repo = createPrismaSpaceRepository(getPrisma());
    const { id } = await repo.createDraft({ title: 'باغ محله', slug: 'baagh-mahalle-join-test', policyVersion: 1, creatorId: userId });
    await repo.createNewVersion({
      spaceId: id,
      title: 'باغ محله',
      purpose: 'p',
      participationMethods: ['حضوری'],
      roles: TWO_PRIMARY_ROLES,
      policyVersion: 1,
      createdBy: userId,
    });
    const roleId = (await repo.findById(id))!.roles[0]!.id;

    await repo.joinRole(id, otherUserId, roleId);
    await repo.joinRole(id, otherUserId, roleId); // idempotent, no throw
    const count = await getPrisma().spaceRoleMembership.count({ where: { userId: otherUserId, roleId } });
    expect(count).toBe(1);

    await repo.leaveRole(otherUserId, roleId);
    await repo.leaveRole(otherUserId, roleId); // idempotent, no throw
    await expect(getPrisma().spaceRoleMembership.count({ where: { userId: otherUserId, roleId } })).resolves.toBe(0);
  });

  it('createInvite/resolveInvite/revokeInvite round-trip against real rows, and a revoked token stops resolving', async () => {
    const repo = createPrismaSpaceRepository(getPrisma());
    const { id, slug } = await (async () => {
      const created = await repo.createDraft({ title: 'باغ محله', slug: 'baagh-mahalle-invite-test', policyVersion: 1, creatorId: userId });
      return { id: created.id, slug: 'baagh-mahalle-invite-test' };
    })();

    await repo.createInvite(id, userId, 'test-token-abc123');
    await expect(repo.resolveInvite('test-token-abc123')).resolves.toEqual({ spaceId: id, slug });

    const revoked = await repo.revokeInvite(id, 'test-token-abc123');
    expect(revoked).toBe(true);
    await expect(repo.resolveInvite('test-token-abc123')).resolves.toBeNull();

    // Revoking again is idempotent, not an error.
    await expect(repo.revokeInvite(id, 'test-token-abc123')).resolves.toBe(false);
  });
});
