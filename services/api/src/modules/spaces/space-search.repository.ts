import { Prisma, type PrismaClient } from '@taavon/database';
import type { SpaceSearchRepository, SpaceSearchResultRecord } from './space-search.service';

interface SearchRow {
  id: string;
  slug: string;
  title: string;
  purpose: string;
  followerCount: bigint | number;
  publishedAt: Date;
  score: number;
}

export function createPrismaSpaceSearchRepository(prisma: PrismaClient): SpaceSearchRepository {
  return {
    async search({ normalizedQuery, scope, userId, limit, after }) {
      const hasQuery = normalizedQuery.length > 0;

      // `score` has to be a real expression repeated in both the CTE's
      // filter and the outer ORDER BY/keyset comparison - Postgres doesn't
      // let a WHERE clause see a sibling SELECT's own column alias, hence
      // the CTE rather than one flat query.
      //
      // word_similarity()/`<%`, not the plain similarity()/`%` pair: plain
      // similarity() scores the two ENTIRE strings against each other, so a
      // short query against a much longer searchText (title+purpose+
      // audience concatenated) dilutes to a near-zero score even when the
      // query matches perfectly - confirmed directly (a real "باغ محله"
      // query against a real published space's own title scored 0.12,
      // under the default 0.3 threshold, so `%` silently excluded a
      // literal, correct match). word_similarity() instead scores the
      // query against its best-matching *substring* of searchText (0.12 →
      // 1.0 for that same pair), which is what "does this query appear in
      // this document" search actually needs. The GIN trgm index built in
      // this task's migration accelerates both operator families equally.
      const scoreExpr = hasQuery ? Prisma.sql`word_similarity(${normalizedQuery}, s."searchText")` : Prisma.sql`1.0`;
      const queryFilter = hasQuery ? Prisma.sql`AND ${normalizedQuery} <% s."searchText"` : Prisma.empty;
      const scopeFilter =
        scope === 'following' && userId
          ? Prisma.sql`AND EXISTS (SELECT 1 FROM space_followers sf WHERE sf."spaceId" = s.id AND sf."userId" = ${userId}::uuid)`
          : Prisma.empty;
      const cursorFilter = after
        ? Prisma.sql`WHERE (score, "followerCount", "publishedAt", id) < (${after.score}, ${after.followerCount}, ${after.publishedAt}::timestamptz, ${after.id}::uuid)`
        : Prisma.empty;

      const rows = await prisma.$queryRaw<SearchRow[]>`
        WITH ranked AS (
          SELECT
            s.id,
            s.slug,
            v.title,
            v.purpose,
            s."publishedAt",
            (SELECT count(*)::int FROM space_followers sf2 WHERE sf2."spaceId" = s.id) AS "followerCount",
            ${scoreExpr} AS score
          FROM spaces s
          JOIN space_definition_versions v
            ON v.id = (SELECT id FROM space_definition_versions WHERE "spaceId" = s.id ORDER BY "versionNumber" DESC LIMIT 1)
          WHERE s.status = 'PUBLISHED'
            ${queryFilter}
            ${scopeFilter}
        )
        SELECT * FROM ranked
        ${cursorFilter}
        ORDER BY score DESC, "followerCount" DESC, "publishedAt" DESC, id DESC
        LIMIT ${limit}
      `;

      return rows.map(
        (row): SpaceSearchResultRecord => ({
          id: row.id,
          slug: row.slug,
          title: row.title,
          purpose: row.purpose,
          followerCount: Number(row.followerCount),
          publishedAt: row.publishedAt,
          score: row.score,
        })
      );
    },

    async followSpace(spaceId, userId) {
      await prisma.spaceFollower.upsert({
        where: { spaceId_userId: { spaceId, userId } },
        create: { spaceId, userId },
        update: {},
      });
    },

    async unfollowSpace(spaceId, userId) {
      await prisma.spaceFollower.deleteMany({ where: { spaceId, userId } });
    },
  };
}
