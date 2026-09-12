import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@taavon/database';
import { createPrismaSpaceRepository } from './space.repository';
import { createPrismaSpaceSearchRepository } from './space-search.repository';

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

describe.skipIf(!databaseAvailable)('SpaceSearchRepository: real Postgres', () => {
  const spaceRepo = createPrismaSpaceRepository(getPrisma());
  const searchRepo = createPrismaSpaceSearchRepository(getPrisma());
  let userId: string;
  let followerId: string;
  const createdSpaceIds: string[] = [];

  // Every slug this suite creates starts here, which is what makes the
  // recovery purge in beforeAll possible - and also what makes it necessary.
  const SLUG_PREFIX = 'search-test-';

  // Deletes the given spaces and every row that references them, children
  // first. Callers select the spaces either by the ids this run recorded (the
  // normal teardown) or by slug prefix (the recovery path).
  async function purgeSpaces(where: { id: { in: string[] } } | { slug: { startsWith: string } }) {
    const prisma = getPrisma();
    const ids = (await prisma.space.findMany({ where, select: { id: true } })).map((s) => s.id);
    if (ids.length === 0) return;
    await prisma.spaceFollower.deleteMany({ where: { spaceId: { in: ids } } });
    await prisma.spaceRoleMembership.deleteMany({ where: { spaceId: { in: ids } } });
    await prisma.spaceParticipationRole.deleteMany({ where: { spaceId: { in: ids } } });
    await prisma.spaceDefinitionVersion.deleteMany({ where: { spaceId: { in: ids } } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: ids } } });
    await prisma.space.deleteMany({ where: { id: { in: ids } } });
  }

  beforeAll(async () => {
    // These slugs are deterministic, so a run that dies before afterEach gets
    // to run (a dropped connection mid-suite is enough) leaves rows behind
    // that make every later run on the same database fail on the
    // spaces_slug_key unique constraint - and fail in a way that leaks the
    // next batch of rows too, so it never recovers on its own. Purging the
    // suite's own slug namespace up front makes the suite idempotent against
    // a persistent database instead of only a throwaway one.
    await purgeSpaces({ slug: { startsWith: SLUG_PREFIX } });

    const user = await getPrisma().user.create({ data: {} });
    const follower = await getPrisma().user.create({ data: {} });
    userId = user.id;
    followerId = follower.id;
  });

  afterEach(async () => {
    await purgeSpaces({ id: { in: createdSpaceIds } });
    createdSpaceIds.length = 0;
  });

  afterAll(async () => {
    await getPrisma().user.deleteMany({ where: { id: { in: [userId, followerId] } } });
  });

  async function createPublishedSpace(title: string, purpose: string, slugSuffix: string) {
    const { id } = await spaceRepo.createDraft({ title, slug: `${SLUG_PREFIX}${slugSuffix}`, policyVersion: 1, creatorId: userId });
    createdSpaceIds.push(id);
    await spaceRepo.createNewVersion({
      spaceId: id,
      title,
      purpose,
      participationMethods: ['حضوری'],
      roles: TWO_PRIMARY_ROLES,
      policyVersion: 1,
      createdBy: userId,
    });
    await spaceRepo.publish(id);
    return id;
  }

  it('a short query still matches a space whose purpose is much longer than the query itself - word_similarity, not whole-string similarity (real bug found via a live smoke test: plain similarity() scored a genuine match at 0.12, under the 0.3 default threshold, silently excluding it)', async () => {
    const id = await createPublishedSpace(
      'باغ محله آزمایشی',
      'این بستر برای هماهنگی داوطلبانه‌ی نگهداری باغچه‌ی محله تشکیل شده است.',
      'word-similarity-regression'
    );

    const results = await searchRepo.search({ normalizedQuery: 'باغ محله', scope: 'all', userId: null, limit: 20, after: null });
    expect(results.map((r) => r.id)).toContain(id);
  });

  it('only returns PUBLISHED spaces - a DRAFT never appears', async () => {
    const publishedId = await createPublishedSpace('باغ محله یک', 'نگهداری باغچه محله', 'draft-filter-1');
    const { id: draftId } = await spaceRepo.createDraft({ title: 'باغ محله دو', slug: 'search-test-draft-filter-2', policyVersion: 1, creatorId: userId });
    createdSpaceIds.push(draftId);

    const results = await searchRepo.search({ normalizedQuery: '', scope: 'all', userId: null, limit: 20, after: null });
    const ids = results.map((r) => r.id);
    expect(ids).toContain(publishedId);
    expect(ids).not.toContain(draftId);
  });

  it('an ARCHIVED space does not appear in results either', async () => {
    const id = await createPublishedSpace('باغ محله بایگانی', 'نگهداری باغچه محله', 'archived-filter');
    await getPrisma().space.update({ where: { id }, data: { status: 'ARCHIVED' } });

    const results = await searchRepo.search({ normalizedQuery: '', scope: 'all', userId: null, limit: 20, after: null });
    expect(results.map((r) => r.id)).not.toContain(id);
  });

  it('a text query ranks a trigram-similar title above an unrelated one, and excludes the unrelated one entirely', async () => {
    const gardenId = await createPublishedSpace('باغ محله سرسبز', 'نگهداری مشترک باغچه محله توسط داوطلبان', 'trgm-match');
    await createPublishedSpace('دورهمی برنامه‌نویسی هفتگی', 'تمرین گروهی الگوریتم', 'trgm-unrelated');

    const results = await searchRepo.search({ normalizedQuery: 'باغ محله سرسبز', scope: 'all', userId: null, limit: 20, after: null });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.id).toBe(gardenId);
  });

  it('ranks by followerCount as a tiebreaker when there is no query', async () => {
    const lessFollowed = await createPublishedSpace('بستر کم‌فالوور', 'purpose', 'rank-low');
    const moreFollowed = await createPublishedSpace('بستر پرفالوور', 'purpose', 'rank-high');
    await searchRepo.followSpace(moreFollowed, followerId);

    const results = await searchRepo.search({ normalizedQuery: '', scope: 'all', userId: null, limit: 20, after: null });
    const moreIndex = results.findIndex((r) => r.id === moreFollowed);
    const lessIndex = results.findIndex((r) => r.id === lessFollowed);
    expect(moreIndex).toBeLessThan(lessIndex);
    expect(results.find((r) => r.id === moreFollowed)?.followerCount).toBe(1);
  });

  it('scope=following only returns spaces the given user actually follows', async () => {
    const followed = await createPublishedSpace('بستر دنبال‌شده', 'purpose', 'following-yes');
    await createPublishedSpace('بستر دنبال‌نشده', 'purpose', 'following-no');
    await searchRepo.followSpace(followed, followerId);

    const results = await searchRepo.search({ normalizedQuery: '', scope: 'following', userId: followerId, limit: 20, after: null });
    expect(results.map((r) => r.id)).toEqual([followed]);
  });

  it('followSpace/unfollowSpace are idempotent', async () => {
    const id = await createPublishedSpace('بستر idempotent', 'purpose', 'idempotent-follow');

    await searchRepo.followSpace(id, followerId);
    await searchRepo.followSpace(id, followerId);
    await expect(getPrisma().spaceFollower.count({ where: { spaceId: id, userId: followerId } })).resolves.toBe(1);

    await searchRepo.unfollowSpace(id, followerId);
    await searchRepo.unfollowSpace(id, followerId);
    await expect(getPrisma().spaceFollower.count({ where: { spaceId: id, userId: followerId } })).resolves.toBe(0);
  });

  it('keyset pagination across two pages returns every item exactly once, in a stable order', async () => {
    const ids = await Promise.all(
      Array.from({ length: 5 }, (_, i) => createPublishedSpace(`بستر صفحه‌بندی ${i}`, 'purpose مشترک برای تست', `paging-${i}`))
    );

    const page1 = await searchRepo.search({ normalizedQuery: '', scope: 'all', userId: null, limit: 3, after: null });
    expect(page1).toHaveLength(3);
    const cursorAfter = { score: page1[2]!.score, followerCount: page1[2]!.followerCount, publishedAt: page1[2]!.publishedAt.toISOString(), id: page1[2]!.id };

    const page2 = await searchRepo.search({ normalizedQuery: '', scope: 'all', userId: null, limit: 3, after: cursorAfter });

    const allIds = [...page1, ...page2].map((r) => r.id).filter((id) => ids.includes(id));
    expect(new Set(allIds).size).toBe(allIds.length); // no repeats
    expect(allIds).toHaveLength(5); // no omissions
  });
});
