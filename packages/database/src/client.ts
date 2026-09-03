import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

export { PrismaClient } from './generated/prisma/client';
export * from './generated/prisma/enums';

let cachedClient: PrismaClient | null = null;

/**
 * Returns a process-wide singleton PrismaClient, built lazily on first call
 * against DATABASE_URL via the Postgres driver adapter (Prisma 7 has no
 * bundled query engine - see packages/database/prisma.config.ts). Throws
 * immediately if DATABASE_URL is missing, rather than constructing a client
 * that would only fail later on first query.
 */
export function getPrisma(): PrismaClient {
  if (!cachedClient) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is required to create a Prisma client.');
    }
    const adapter = new PrismaPg({ connectionString });
    cachedClient = new PrismaClient({ adapter });
  }
  return cachedClient;
}

/** Test-only: clears the singleton so tests can force a fresh client. */
export function resetPrismaClientForTests(): void {
  cachedClient = null;
}
