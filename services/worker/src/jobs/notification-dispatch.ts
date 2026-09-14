import { getPrisma, type PrismaClient } from '@taavon/database';
import {
  createPrismaNotificationJobRepository,
  runNotificationJob,
  type NotificationJobResult,
} from '@taavon/notifications';

/**
 * The "notification-dispatch" queue's processor - a thin wrapper around the
 * shared, already-tested `runNotificationJob`, wired to a real Prisma client.
 * Injectable `prisma` so this stays testable without a BullMQ/Redis
 * connection.
 */
export async function processNotificationDispatchJob(
  prisma: PrismaClient = getPrisma(),
  limit?: number
): Promise<NotificationJobResult> {
  const repo = createPrismaNotificationJobRepository(prisma);
  return runNotificationJob(repo, limit);
}
