import { describe, expect, it } from 'vitest';
import { findSimilarSpaces, rankSimilarSpaces, type SimilarityCandidate } from './space-similarity.service';

const GARDEN: SimilarityCandidate = {
  spaceId: '11111111-1111-4111-8111-111111111111',
  slug: 'baagh-mahalle',
  title: 'باغ محله',
  purpose: 'نگهداری مشترک باغچه محله توسط داوطلبان',
};
const BOOK_CLUB: SimilarityCandidate = {
  spaceId: '22222222-2222-4222-8222-222222222222',
  slug: 'book-club',
  title: 'باشگاه کتاب',
  purpose: 'دور هم خواندن و بحث دربارهٔ رمان‌های فارسی',
};
const UNRELATED: SimilarityCandidate = {
  spaceId: '33333333-3333-4333-8333-333333333333',
  slug: 'coding-meetup',
  title: 'دورهمی برنامه‌نویسی',
  purpose: 'تمرین گروهی الگوریتم و مصاحبهٔ فنی',
};

describe('rankSimilarSpaces (pure token-overlap scoring)', () => {
  it('ranks a near-duplicate title/purpose above an unrelated one', () => {
    const results = rankSimilarSpaces(
      { title: 'باغچهٔ محله ما', purpose: 'نگهداری باغچه محله توسط ساکنان داوطلب' },
      [GARDEN, BOOK_CLUB, UNRELATED]
    );
    expect(results[0]?.id).toBe(GARDEN.spaceId);
    expect(results[0]!.overlapScore).toBeGreaterThan(0);
  });

  it('excludes candidates with zero token overlap entirely', () => {
    const results = rankSimilarSpaces({ title: 'باغ محله', purpose: 'نگهداری مشترک باغچه محله توسط داوطلبان' }, [UNRELATED]);
    expect(results).toHaveLength(0);
  });

  it('normalizes ي/ك the same as slug generation, so spelling variants still match', () => {
    const arabicSpelled: SimilarityCandidate = { ...GARDEN, title: 'كتابخانه محله', purpose: 'كتابخانه محله' };
    const results = rankSimilarSpaces({ title: 'کتابخانه محله', purpose: 'کتابخانه محله' }, [arabicSpelled]);
    expect(results).toHaveLength(1);
    expect(results[0]!.overlapScore).toBe(1);
  });

  it('caps results at 5 by default, taking the highest-scoring ones', () => {
    const candidates: SimilarityCandidate[] = Array.from({ length: 8 }, (_, i) => ({
      spaceId: `space-${i}`,
      slug: `space-${i}`,
      title: 'باغ محله',
      purpose: 'نگهداری مشترک باغچه محله توسط داوطلبان',
    }));
    const results = rankSimilarSpaces({ title: 'باغ محله', purpose: 'نگهداری مشترک باغچه محله توسط داوطلبان' }, candidates);
    expect(results).toHaveLength(5);
  });

  it('respects a custom limit', () => {
    const results = rankSimilarSpaces({ title: 'باغ محله', purpose: 'نگهداری' }, [GARDEN, BOOK_CLUB], 1);
    expect(results).toHaveLength(1);
  });

  it('is a pure function - same input, same output', () => {
    const input = { title: 'باغ محله', purpose: 'نگهداری مشترک باغچه محله' };
    expect(rankSimilarSpaces(input, [GARDEN, BOOK_CLUB])).toEqual(rankSimilarSpaces(input, [GARDEN, BOOK_CLUB]));
  });
});

describe('findSimilarSpaces (orchestration)', () => {
  it('delegates to the repository for candidates, then ranks them', async () => {
    const repo = { listPublishedForSimilarity: async () => [GARDEN, BOOK_CLUB, UNRELATED] };
    const results = await findSimilarSpaces(repo, 'باغچهٔ محله ما', 'نگهداری باغچه محله توسط ساکنان داوطلب');
    expect(results[0]?.id).toBe(GARDEN.spaceId);
  });

  it('returns an empty array when nothing overlaps', async () => {
    const repo = { listPublishedForSimilarity: async () => [UNRELATED] };
    const results = await findSimilarSpaces(repo, 'باغ محله', 'نگهداری مشترک باغچه محله توسط داوطلبان');
    expect(results).toEqual([]);
  });
});
