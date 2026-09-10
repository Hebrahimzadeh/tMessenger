import { Prisma, type PrismaClient } from '@taavon/database';
import type { IdempotencyRepository } from '../../lib/idempotency';

function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export function createPrismaIdempotencyRepository(prisma: PrismaClient): IdempotencyRepository {
  return {
    async find(scope, actorId, key) {
      const row = await prisma.idempotencyRecord.findUnique({ where: { scope_actorId_key: { scope, actorId, key } } });
      return row ? { responseStatus: row.responseStatus, responseBody: row.responseBody } : null;
    },

    async save(scope, actorId, key, responseStatus, responseBody) {
      try {
        await prisma.idempotencyRecord.create({
          data: { scope, actorId, key, responseStatus, responseBody: responseBody as Prisma.InputJsonValue },
        });
      } catch (err) {
        // Two concurrent successful calls under the same key both try to
        // save - the first one wins and this one is a harmless no-op; the
        // now-existing row is what `find` will return on any future replay.
        if (!isUniqueConstraintViolation(err)) throw err;
      }
    },
  };
}
