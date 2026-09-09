import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@taavon/database';
import { createPrismaSpaceHealthRepository } from './repository';

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

// This package has no dependency on services/api's own space.repository.ts
// (that would be a backwards dependency - a foundational shared package
// importing from a service that depends on it), so test spaces here are
// built directly with raw Prisma calls rather than borrowing services/api's
// richer create/publish helpers.
describe.skipIf(!databaseAvailable)('SpaceHealthRepository: real Postgres', () => {
  const healthRepo = createPrismaSpaceHealthRepository(getPrisma());
  let userId: string;
  let contributorId: string;
  const createdSpaceIds: string[] = [];
  let slugCounter = 0;

  beforeAll(async () => {
    const user = await getPrisma().user.create({ data: {} });
    const contributor = await getPrisma().user.create({ data: {} });
    userId = user.id;
    contributorId = contributor.id;
  });

  afterEach(async () => {
    await getPrisma().spaceHealthSnapshot.deleteMany({ where: { spaceId: { in: createdSpaceIds } } });
    await getPrisma().spaceRoleMembership.deleteMany({ where: { spaceId: { in: createdSpaceIds } } });
    await getPrisma().spaceParticipationRole.deleteMany({ where: { spaceId: { in: createdSpaceIds } } });
    await getPrisma().spaceDefinitionVersion.deleteMany({ where: { spaceId: { in: createdSpaceIds } } });
    await getPrisma().space.deleteMany({ where: { id: { in: createdSpaceIds } } });
    createdSpaceIds.length = 0;
  });

  async function createSpace(options: { published: boolean; cardHints?: unknown }) {
    slugCounter += 1;
    const space = await getPrisma().space.create({
      data: {
        slug: `health-repo-test-${slugCounter}`,
        creatorId: userId,
        status: options.published ? 'PUBLISHED' : 'DRAFT',
        publishedAt: options.published ? new Date() : null,
      },
    });
    createdSpaceIds.push(space.id);

    const roleA = await getPrisma().spaceParticipationRole.create({
      data: { spaceId: space.id, key: 'organizer', title: 'سازمان‌دهنده', isPrimary: true },
    });
    const roleB = await getPrisma().spaceParticipationRole.create({
      data: { spaceId: space.id, key: 'contributor', title: 'همکار', isPrimary: true },
    });

    await getPrisma().spaceDefinitionVersion.create({
      data: {
        spaceId: space.id,
        versionNumber: 1,
        title: 'باغ محله سلامت',
        purpose: 'purpose text',
        participationMethods: ['حضوری'],
        cardHints: (options.cardHints as never) ?? undefined,
        primaryRoleIds: [roleA.id, roleB.id],
        supplementaryRoleIds: [],
        policyVersion: 1,
        createdBy: userId,
      },
    });

    return { spaceId: space.id, roleAId: roleA.id, roleBId: roleB.id };
  }

  it('gatherSignals reflects real role memberships, not example card content', async () => {
    const { spaceId, roleAId } = await createSpace({
      published: true,
      cardHints: [{ isExample: true, label: 'نمونه', title: 'کارت نمونه فریبنده', description: 'اگر شمرده شود یعنی باگ است' }],
    });
    await getPrisma().spaceRoleMembership.create({ data: { spaceId, userId: contributorId, roleId: roleAId } });

    const signals = await healthRepo.gatherSignals(spaceId);
    expect(signals.contributorCount).toBe(1);
    expect(signals.totalRoleCount).toBe(2);
    expect(signals.activeRoleCount).toBe(1);
    // The card hint above exists purely as descriptive JSON - gatherSignals
    // never reads cardHints at all, so cardCount is unaffected by it.
    expect(signals.cardCount).toBe(0);
  });

  it('upsertSnapshot is idempotent - running it twice for the same space updates the one row, not creating a second', async () => {
    const { spaceId } = await createSpace({ published: true });
    const signals = await healthRepo.gatherSignals(spaceId);

    await healthRepo.upsertSnapshot(spaceId, 'NEW', signals, []);
    await healthRepo.upsertSnapshot(spaceId, 'ACTIVE', signals, [{ code: 'CREATE_FIRST_CARD' }]);

    const count = await getPrisma().spaceHealthSnapshot.count({ where: { spaceId } });
    expect(count).toBe(1);

    const snapshot = await healthRepo.getSnapshot(spaceId);
    expect(snapshot?.status).toBe('ACTIVE');
    expect(snapshot?.suggestions).toEqual([{ code: 'CREATE_FIRST_CARD' }]);
  });

  it('getSnapshot returns null before any snapshot has ever been computed', async () => {
    const { spaceId } = await createSpace({ published: true });
    await expect(healthRepo.getSnapshot(spaceId)).resolves.toBeNull();
  });

  it('listPublishedSpaceIds only returns PUBLISHED spaces', async () => {
    const { spaceId: publishedId } = await createSpace({ published: true });
    const { spaceId: draftId } = await createSpace({ published: false });

    const ids = await healthRepo.listPublishedSpaceIds();
    expect(ids).toContain(publishedId);
    expect(ids).not.toContain(draftId);
  });
});
