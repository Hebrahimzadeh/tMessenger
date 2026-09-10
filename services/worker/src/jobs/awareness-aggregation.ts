import { getPrisma, type PrismaClient } from '@taavon/database';
import {
  createPrismaAwarenessAggregationRepository,
  runAwarenessAggregationJob,
  type AwarenessAggregationJobResult,
} from '@taavon/awareness';

/** The "awareness-aggregation" queue's processor (worker.ts) - a thin wrapper around the shared, already-tested `runAwarenessAggregationJob`, wired to a real Prisma client. Injectable `prisma`/`now` so this stays testable without a real BullMQ/Redis connection. */
export async function processAwarenessAggregationJob(
  prisma: PrismaClient = getPrisma(),
  now?: Date
): Promise<AwarenessAggregationJobResult> {
  const repo = createPrismaAwarenessAggregationRepository(prisma);
  return runAwarenessAggregationJob(repo, now);
}
