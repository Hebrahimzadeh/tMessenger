import { getPrisma, type PrismaClient } from '@taavon/database';

/**
 * How long an archived prompt's words are kept (owner decision 2026-09-29).
 *
 * The record itself is kept forever - which decision was reached, which rules
 * it cited, what it cost. Only the text expires, which is what keeps an
 * archive built for review from becoming a store of everything anyone ever
 * typed.
 */
export const PROMPT_TEXT_RETENTION_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PromptArchivePurgeRepository {
  /** Nulls the text of archive rows older than `before` that still have some. Returns how many it cleared. */
  purgePromptArchive(before: Date, purgedAt: Date): Promise<number>;
  /** The same, for the space build archive. */
  purgeBuildAttempts(before: Date, purgedAt: Date): Promise<number>;
}

export interface PromptArchivePurgeResult {
  /** Anything created before this moment has had its text cleared. */
  cutoff: Date;
  archiveRows: number;
  attemptRows: number;
}

/**
 * Clears expired prompt text, and nothing else.
 *
 * Deliberately an update rather than a delete: a purged row keeps its
 * decision, its policy refs and its cost, and `textPurgedAt` says why the
 * words are gone. Deleting the rows instead would make "expired" and "never
 * recorded" look identical, which is exactly the distinction someone
 * reviewing an old decision needs.
 *
 * Idempotent by construction - both writes skip rows already stamped - so
 * running it twice in a day clears nothing the first run did not.
 */
export async function runPromptArchivePurge(
  repo: PromptArchivePurgeRepository,
  now: Date = new Date()
): Promise<PromptArchivePurgeResult> {
  const cutoff = new Date(now.getTime() - PROMPT_TEXT_RETENTION_DAYS * DAY_MS);
  const archiveRows = await repo.purgePromptArchive(cutoff, now);
  const attemptRows = await repo.purgeBuildAttempts(cutoff, now);
  return { cutoff, archiveRows, attemptRows };
}

export function createPrismaPromptArchivePurgeRepository(prisma: PrismaClient): PromptArchivePurgeRepository {
  return {
    async purgePromptArchive(before, purgedAt) {
      const { count } = await prisma.aiPromptArchive.updateMany({
        // `textPurgedAt: null` is what makes a second run a no-op rather than
        // a rewrite of rows already cleared.
        where: { createdAt: { lt: before }, textPurgedAt: null },
        data: { userText: null, renderedPrompt: null, textPurgedAt: purgedAt },
      });
      return count;
    },

    async purgeBuildAttempts(before, purgedAt) {
      const { count } = await prisma.spaceBuildAttempt.updateMany({
        where: { createdAt: { lt: before }, textPurgedAt: null },
        data: { userPrompt: null, textPurgedAt: purgedAt },
      });
      return count;
    },
  };
}

/** The "prompt-archive-purge" queue's processor (worker.ts), wired to a real Prisma client. */
export async function processPromptArchivePurgeJob(
  prisma: PrismaClient = getPrisma(),
  now?: Date
): Promise<PromptArchivePurgeResult> {
  return runPromptArchivePurge(createPrismaPromptArchivePurgeRepository(prisma), now);
}
