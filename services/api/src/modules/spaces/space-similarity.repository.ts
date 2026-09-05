import type { PrismaClient } from '@taavon/database';
import type { SpaceSimilarityRepository } from './space-similarity.service';

export function createPrismaSpaceSimilarityRepository(prisma: PrismaClient): SpaceSimilarityRepository {
  return {
    async listPublishedForSimilarity() {
      const spaces = await prisma.space.findMany({
        where: { status: 'PUBLISHED' },
        select: {
          id: true,
          slug: true,
          definitionVersions: { orderBy: { versionNumber: 'desc' }, take: 1, select: { title: true, purpose: true } },
        },
      });

      return spaces
        .filter((space) => space.definitionVersions.length > 0)
        .map((space) => ({
          spaceId: space.id,
          slug: space.slug,
          title: space.definitionVersions[0]!.title,
          purpose: space.definitionVersions[0]!.purpose,
        }));
    },
  };
}
