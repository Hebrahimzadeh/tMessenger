import './config/load-dotenv';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { parseWorkerEnv } from './config/env';
import { processSpaceHealthJob } from './jobs/space-health';

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
