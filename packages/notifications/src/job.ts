import { deriveNotifications, type AudienceLookup, type NotificationIntent, type OutboxEventInput } from './derive';

export interface NotificationJobRepository {
  /** Unprocessed outbox rows, oldest first, up to `limit`. */
  claimUnprocessed(limit: number): Promise<OutboxEventInput[]>;
  /**
   * Creates the notification and its IN_APP delivery row, or does nothing if
   * `dedupKey` already exists. Returns whether this call was the one that
   * created it, which is only used for reporting.
   */
  createIfNew(intent: NotificationIntent): Promise<boolean>;
  markProcessed(outboxEventId: string): Promise<void>;
  recordAttempt(outboxEventId: string): Promise<void>;
  audience: AudienceLookup;
}

export interface NotificationJobResult {
  processedEventIds: string[];
  created: number;
  /** Events that threw and were left unprocessed for the next run. */
  deferred: string[];
}

export const NOTIFICATION_BATCH_SIZE = 100;

/**
 * Drains the outbox into notifications.
 *
 * At-least-once, deliberately. An event is marked processed only after its
 * notifications are safely created, so a crash between the two leaves the row
 * unprocessed and the next run does it again. That re-run is harmless because
 * every notification is keyed by `dedupKey` and a repeat collides with the
 * unique index instead of creating a second one - the database decides, not
 * this loop's memory of what it has seen.
 *
 * One bad event must not block the queue. A failure is counted, left
 * unprocessed, and the loop continues, so a single malformed row cannot stop
 * everyone else's notifications - the failure mode a naive drain has, where
 * the head of the queue poisons everything behind it.
 */
export async function runNotificationJob(
  repo: NotificationJobRepository,
  limit: number = NOTIFICATION_BATCH_SIZE
): Promise<NotificationJobResult> {
  const events = await repo.claimUnprocessed(limit);
  const processedEventIds: string[] = [];
  const deferred: string[] = [];
  let created = 0;

  for (const event of events) {
    try {
      const intents = await deriveNotifications(event, repo.audience);
      for (const intent of intents) {
        if (await repo.createIfNew(intent)) created += 1;
      }
      // Only now. Marking first would lose every notification for this event
      // if the process died mid-batch.
      await repo.markProcessed(event.id);
      processedEventIds.push(event.id);
    } catch {
      await repo.recordAttempt(event.id);
      deferred.push(event.id);
    }
  }

  return { processedEventIds, created, deferred };
}
