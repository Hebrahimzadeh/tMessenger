import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@taavon/database';
import { processSpaceHealthJob } from './space-health';

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

describe.skipIf(!databaseAvailable)('processSpaceHealthJob: real Postgres', () => {
  let userId: string;
  const createdSpaceIds: string[] = [];

  beforeAll(async () => {
    const user = await getPrisma().user.create({ data: {} });
    userId = user.id;
  });

  afterEach(async () => {
    await getPrisma().spaceHealthSnapshot.deleteMany({ where: { spaceId: { in: createdSpaceIds } } });
    await getPrisma().spaceParticipationRole.deleteMany({ where: { spaceId: { in: createdSpaceIds } } });
    await getPrisma().spaceDefinitionVersion.deleteMany({ where: { spaceId: { in: createdSpaceIds } } });
    await getPrisma().space.deleteMany({ where: { id: { in: createdSpaceIds } } });
    createdSpaceIds.length = 0;
  });

  it('computes and stores a real snapshot for a real published space end to end', async () => {
    const space = await getPrisma().space.create({
      data: { slug: 'worker-job-test-1', creatorId: userId, status: 'PUBLISHED', publishedAt: new Date() },
    });
    createdSpaceIds.push(space.id);
    await getPrisma().spaceDefinitionVersion.create({
      data: {
        spaceId: space.id,
        versionNumber: 1,
        title: 'باغ محله',
        purpose: 'purpose',
        participationMethods: ['حضوری'],
        primaryRoleIds: [],
        supplementaryRoleIds: [],
        policyVersion: 1,
        createdBy: userId,
      },
    });

    const result = await processSpaceHealthJob(getPrisma());
    expect(result.processedSpaceIds).toContain(space.id);

    const snapshot = await getPrisma().spaceHealthSnapshot.findUnique({ where: { spaceId: space.id } });
    expect(snapshot).not.toBeNull();
    expect(snapshot?.status).toBe('NEW'); // just published, well within the 7-day grace period
  });

  it('running it twice is idempotent - one row per space, not two', async () => {
    const space = await getPrisma().space.create({
      data: { slug: 'worker-job-test-2', creatorId: userId, status: 'PUBLISHED', publishedAt: new Date() },
    });
    createdSpaceIds.push(space.id);
    await getPrisma().spaceDefinitionVersion.create({
      data: {
        spaceId: space.id,
        versionNumber: 1,
        title: 'باغ محله',
        purpose: 'purpose',
        participationMethods: ['حضوری'],
        primaryRoleIds: [],
        supplementaryRoleIds: [],
        policyVersion: 1,
        createdBy: userId,
      },
    });

    await processSpaceHealthJob(getPrisma());
    await processSpaceHealthJob(getPrisma());

    const count = await getPrisma().spaceHealthSnapshot.count({ where: { spaceId: space.id } });
    expect(count).toBe(1);
  });
});
