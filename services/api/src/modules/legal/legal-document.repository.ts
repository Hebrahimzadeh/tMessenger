import type { PrismaClient } from '@taavon/database';
import type { LegalDocumentType } from '@taavon/contracts';
import type { LegalDocumentRecord, LegalDocumentRepository } from './legal-document.service';

/**
 * Prisma-backed LegalDocumentRepository. "Latest effective" is the highest
 * version of `type` whose effectiveAt has already passed - a version can be
 * seeded ahead of time (scheduled) without becoming current early, and once
 * published a version is never rewritten (Task 05 acceptance), only
 * superseded by a new, higher version row.
 */
export function createPrismaLegalDocumentRepository(prisma: PrismaClient): LegalDocumentRepository {
  return {
    async findLatestEffective(type: LegalDocumentType): Promise<LegalDocumentRecord | null> {
      return prisma.legalDocumentVersion.findFirst({
        where: { type, effectiveAt: { lte: new Date() } },
        orderBy: { version: 'desc' },
        select: { version: true, publicUrl: true },
      });
    },
  };
}
