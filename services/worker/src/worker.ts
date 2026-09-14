import './config/load-dotenv';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { parseWorkerEnv } from './config/env';
import { processSpaceHealthJob } from './jobs/space-health';
import { processAwarenessAggregationJob } from './jobs/awareness-aggregation';
import { processNotificationDispatchJob } from './jobs/notification-dispatch';

const env = parseWorkerEnv();

// BullMQ requires maxRetriesPerRequest: null on its own connection - a
// different setting than services/api's own redis.ts plugin (1), which is
// tuned for request-serving latency, not a long-lived queue connection.
//
// ioredis is pinned to v5 here (not services/api's v6) deliberately:
// bullmq@5's own type definitions expect its own bundled ioredis v5's
// `Redis` shape, and passing a v6 instance fails to typecheck (confirmed
// directly - a genuine structural incompatibility between the two majors,
// not just a version-number mismatch). Each service resolves its own
// ioredis version independently in this workspace; this only affects
// services/worker.
const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

const QUEUE_NAME = 'space-health';
const DAILY_JOB_NAME = 'daily-space-health';

const queue = new Queue(QUEUE_NAME, { connection });

/**
 * Schedules the daily job idempotently: `upsertJobScheduler` replaces any
 * existing scheduler with this exact id rather than adding a second one, so
 * restarting this process (a redeploy, a crash recovery) never produces
 * duplicate repeatable jobs - "job روزانهٔ idempotent" at the scheduling
 * level, on top of `runSpaceHealthJob`'s own idempotent upserts at the data
 * level (see @taavon/space-health's job.ts).
 */
async function scheduleDailyJob(): Promise<void> {
  await queue.upsertJobScheduler(
    DAILY_JOB_NAME,
    { pattern: '0 3 * * *' }, // 03:00 server time, every day
    { name: DAILY_JOB_NAME }
  );
}

const worker = new Worker(
  QUEUE_NAME,
  async () => {
    const result = await processSpaceHealthJob();
    return result;
  },
  { connection }
);

worker.on('completed', (job, result: { processedSpaceIds: string[] }) => {
  // eslint-disable-next-line no-console -- this process has no HTTP request/response cycle to attach structured logging to; console is the worker's own log stream (matches its own docker-compose/deploy log capture).
  console.log(`[space-health] job ${job.id} completed - processed ${result.processedSpaceIds.length} space(s)`);
});

worker.on('failed', (job, err) => {
  // eslint-disable-next-line no-console -- see the completed handler's own comment above.
  console.error(`[space-health] job ${job?.id ?? '(unknown)'} failed`, err);
});

await scheduleDailyJob();
// eslint-disable-next-line no-console -- see the completed handler's own comment above.
console.log('[worker] space-health worker started; daily job scheduled for 03:00');

// --- awareness aggregation: a second, independent queue/worker/scheduler ---
// "aggregation روزانه" (Task 18) - kept on its own queue rather than
// folded into the space-health job so the two remain independently
// retryable/observable (a failure in one never blocks or is masked by the
// other), the same reasoning BullMQ's own docs give for one queue per job
// kind. Scheduled 30 minutes after space-health, purely to stagger load;
// there is no real dependency between the two.
const AWARENESS_QUEUE_NAME = 'awareness-aggregation';
const AWARENESS_DAILY_JOB_NAME = 'daily-awareness-aggregation';

const awarenessQueue = new Queue(AWARENESS_QUEUE_NAME, { connection });

async function scheduleAwarenessDailyJob(): Promise<void> {
  await awarenessQueue.upsertJobScheduler(
    AWARENESS_DAILY_JOB_NAME,
    { pattern: '30 3 * * *' }, // 03:30 server time, every day
    { name: AWARENESS_DAILY_JOB_NAME }
  );
}

const awarenessWorker = new Worker(
  AWARENESS_QUEUE_NAME,
  async () => processAwarenessAggregationJob(),
  { connection }
);

awarenessWorker.on('completed', (job, result: { date: string }) => {
  // eslint-disable-next-line no-console -- see the space-health completed handler's own comment above.
  console.log(`[awareness-aggregation] job ${job.id} completed - aggregated ${result.date}`);
});

awarenessWorker.on('failed', (job, err) => {
  // eslint-disable-next-line no-console -- see the space-health failed handler's own comment above.
  console.error(`[awareness-aggregation] job ${job?.id ?? '(unknown)'} failed`, err);
});

await scheduleAwarenessDailyJob();
// eslint-disable-next-line no-console -- see the completed handler's own comment above.
console.log('[worker] awareness-aggregation worker started; daily job scheduled for 03:30');

// --- notification dispatch: a third queue, on a very different cadence ------
// The other two are daily aggregations; this one drains the outbox into
// notifications, and a notification that arrives tomorrow is not a
// notification. Every 10 seconds is the compromise between timeliness and a
// pointless query load on an idle system - the outbox is polled, which is
// inherent to the pattern, so the only lever is how often.
//
// The job itself is at-least-once and idempotent (see @taavon/notifications),
// so a retried or overlapping run cannot produce a duplicate notification.
const NOTIFICATION_QUEUE_NAME = 'notification-dispatch';
const NOTIFICATION_JOB_NAME = 'drain-notification-outbox';

const notificationQueue = new Queue(NOTIFICATION_QUEUE_NAME, { connection });

async function scheduleNotificationJob(): Promise<void> {
  await notificationQueue.upsertJobScheduler(
    NOTIFICATION_JOB_NAME,
    { every: 10_000 },
    { name: NOTIFICATION_JOB_NAME }
  );
}

const notificationWorker = new Worker(
  NOTIFICATION_QUEUE_NAME,
  async () => processNotificationDispatchJob(),
  { connection }
);

notificationWorker.on('completed', (job, result: { created: number; deferred: string[] }) => {
  // Silent on the common case of nothing to do - this runs every ten seconds,
  // and logging each empty pass would bury everything else in the log.
  if (result.created === 0 && result.deferred.length === 0) return;
  // eslint-disable-next-line no-console -- see the space-health completed handler's own comment above.
  console.log(
    `[notification-dispatch] job ${job.id} completed - ${result.created} created, ${result.deferred.length} deferred`
  );
});

notificationWorker.on('failed', (job, err) => {
  // eslint-disable-next-line no-console -- see the space-health failed handler's own comment above.
  console.error(`[notification-dispatch] job ${job?.id ?? '(unknown)'} failed`, err);
});

await scheduleNotificationJob();
// eslint-disable-next-line no-console -- see the completed handler's own comment above.
console.log('[worker] notification-dispatch worker started; draining the outbox every 10s');
