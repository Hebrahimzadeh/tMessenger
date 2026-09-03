import type { FastifyInstance } from 'fastify';
import { healthLiveResponseSchema, healthReadyResponseSchema, type HealthCheckStatus } from '@taavon/contracts';

export type DependencyCheck = () => Promise<boolean>;

export interface HealthRouteOptions {
  version?: string;
  checkDatabase?: DependencyCheck;
  checkRedis?: DependencyCheck;
}

async function toStatus(check: DependencyCheck): Promise<HealthCheckStatus> {
  try {
    return (await check()) ? 'ok' : 'down';
  } catch {
    return 'down';
  }
}

export async function healthRoutes(app: FastifyInstance, opts: HealthRouteOptions = {}) {
  const version = opts.version ?? '0.0.0';
  const checkDatabase = opts.checkDatabase ?? (async () => true);
  const checkRedis = opts.checkRedis ?? (async () => true);

  // live: process is up and can serve traffic. Never depends on downstream
  // services, so it must stay 200 even while the database or Redis is down -
  // that is exactly what should trigger operator attention via `ready`
  // instead of a container restart loop via `live`.
  app.get('/live', async () => {
    return healthLiveResponseSchema.parse({ status: 'ok', version });
  });

  // ready: are this process's dependencies actually usable right now. Task 02
  // wires this to injectable stub checks (default: always healthy) so the
  // degraded path is provable without real infrastructure; Task 03 passes in
  // real database/Redis pings via the same `checkDatabase`/`checkRedis` seam.
  app.get('/ready', async (_request, reply) => {
    const [database, redis] = await Promise.all([toStatus(checkDatabase), toStatus(checkRedis)]);
    const status = database === 'ok' && redis === 'ok' ? 'ok' : 'degraded';
    const body = healthReadyResponseSchema.parse({ status, checks: { database, redis } });

    if (status === 'degraded') {
      reply.code(503);
    }

    return body;
  });
}
