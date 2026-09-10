import { Prisma, type AwarenessEventType } from '@taavon/database';

export interface AwarenessEventInput {
  type: AwarenessEventType;
  actorId: string;
  subjectId: string;
  deepLink?: string;
  idempotencyKey: string;
}

function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/**
 * "log idempotent از کارت، نظر، رزرو، عرضه، استفاده و اتمام بساز" - every
 * writer across the codebase (card creation, a public comment, a role
 * join, every reservation transition, a genuine card view) calls this one
 * helper inside its own already-open transaction. A repeat call with the
 * same `idempotencyKey` is a silent no-op (the unique constraint on
 * `AwarenessEvent.idempotencyKey` is what actually enforces this, not
 * application logic) - "dedup" for free, and safe even if a caller's own
 * retry logic ever calls this twice for the same real-world event.
 */
export async function logAwarenessEvent(tx: Prisma.TransactionClient, input: AwarenessEventInput): Promise<void> {
  try {
    await tx.awarenessEvent.create({ data: input });
  } catch (err) {
    if (!isUniqueConstraintViolation(err)) throw err;
  }
}
