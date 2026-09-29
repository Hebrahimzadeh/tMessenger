import type { SpaceBuildAttemptContract } from '@taavon/contracts';
import type { PrismaClient } from '@taavon/database';

/** How long prompt text is kept before the worker clears it. Mirrors PROMPT_TEXT_RETENTION_DAYS in services/worker; the page shows it so a reader knows why an old row has no words. */
export const PROMPT_TEXT_RETENTION_DAYS = 90;

/** One page of the review list. Deliberately small: this is a reading surface, not an export. */
export const SPACE_BUILD_REVIEW_LIMIT = 50;

export interface SpaceBuildReviewRepository {
  listRecentAttempts(limit: number): Promise<SpaceBuildAttemptContract[]>;
}

/**
 * Every recent build, newest first, refusals included.
 *
 * Refusals are the point as much as successes are: a rule that blocks
 * something it should not is invisible from the space list, because a
 * blocked prompt makes no space. Here it is a row like any other.
 */
export async function listSpaceBuildAttempts(
  repo: SpaceBuildReviewRepository,
  limit: number = SPACE_BUILD_REVIEW_LIMIT
): Promise<{ items: SpaceBuildAttemptContract[]; retentionDays: number }> {
  const items = await repo.listRecentAttempts(limit);
  return { items, retentionDays: PROMPT_TEXT_RETENTION_DAYS };
}

export function createPrismaSpaceBuildReviewRepository(prisma: PrismaClient): SpaceBuildReviewRepository {
  return {
    async listRecentAttempts(limit) {
      const rows = await prisma.spaceBuildAttempt.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          space: { select: { id: true, slug: true, definitionVersions: { orderBy: { versionNumber: 'desc' }, take: 1, select: { title: true } } } },
          request: {
            select: {
              result: { select: { outcome: true, errorCode: true, latencyMs: true } },
              usage: { select: { model: true, costMicros: true } },
              archive: { select: { renderedPrompt: true, document: { select: { text: true } } } },
            },
          },
        },
      });

      return rows.map((row): SpaceBuildAttemptContract => {
        const result = row.request?.result ?? null;
        return {
          id: row.id,
          createdAt: row.createdAt.toISOString(),
          decision: row.decision,
          reason: row.reason,
          // Written by this service as a string[]; parsed back defensively
          // rather than cast, because a Json column can hold anything.
          matchedPolicyRules: Array.isArray(row.matchedPolicyRules) ? row.matchedPolicyRules.map(String) : [],
          policyVersionRef: row.policyVersionRef,
          creativityApplied: row.creativityApplied,
          documentRef: row.documentRef,
          creatorId: row.creatorId,
          space: row.space
            ? { id: row.space.id, slug: row.space.slug, title: row.space.definitionVersions[0]?.title ?? row.space.slug }
            : null,
          userPrompt: row.userPrompt,
          renderedPrompt: row.request?.archive?.renderedPrompt ?? null,
          systemInstruction: row.request?.archive?.document?.text ?? null,
          textPurgedAt: row.textPurgedAt?.toISOString() ?? null,
          call: result
            ? {
                outcome: result.outcome,
                errorCode: result.errorCode,
                latencyMs: result.latencyMs,
                model: row.request?.usage?.model ?? null,
                costMicros: row.request?.usage?.costMicros ?? null,
              }
            : null,
        };
      });
    },
  };
}
