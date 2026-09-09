export interface WorkerEnv {
  DATABASE_URL: string;
  REDIS_URL: string;
}

/** Deliberately minimal - this service only ever touches the database (via @taavon/database's getPrisma()) and Redis (via BullMQ), unlike services/api's much larger env surface. */
export function parseWorkerEnv(raw: NodeJS.ProcessEnv = process.env): WorkerEnv {
  const databaseUrl = raw.DATABASE_URL;
  const redisUrl = raw.REDIS_URL;

  if (!databaseUrl) throw new Error('DATABASE_URL is required to start the worker.');
  if (!redisUrl) throw new Error('REDIS_URL is required to start the worker.');

  return { DATABASE_URL: databaseUrl, REDIS_URL: redisUrl };
}
