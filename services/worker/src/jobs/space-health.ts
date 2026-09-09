import { getPrisma, type PrismaClient } from '@taavon/database';
import { createPrismaSpaceHealthRepository, runSpaceHealthJob, type SpaceHealthJobResult } from '@taavon/space-health';

/** The actual per-run work for the "space-health" queue's processor (worker.ts) - a thin wrapper around the shared, already-tested `runSpaceHealthJob`, wired to a real Prisma client. Injectable `prisma` so this itself stays testable without a real BullMQ/Redis connection. */
export async function processSpaceHealthJob(prisma: PrismaClient = getPrisma()): Promise<SpaceHealthJobResult> {
  const repo = createPrismaSpaceHealthRepository(prisma);
  return runSpaceHealthJob(repo);
}
