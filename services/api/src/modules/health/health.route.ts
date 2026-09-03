import type { FastifyInstance } from 'fastify';
import {
  healthLiveResponseSchema,
  healthReadyResponseSchema,
  type HealthCheckStatus,
  type HealthReadyResponse,
} from '@taavon/contracts';

export type DependencyCheck = () => Promise<boolean>;

export interface HealthRouteOptions {
  version?: string;
  checkDatabase?: DependencyCheck;
  checkRedis?: DependencyCheck;
  checkStorage?: DependencyCheck;
  /**
   * How long a computed /ready result is reused before the dependency
   * checks run again. /ready is public and unauthenticated (see the MVP
   * endpoint list), and checkStorage performs a real put+delete against
   * object storage - without this, an unauthenticated caller could hammer
   * /ready to trigger unbounded real writes against the storage backend
   * (and unnecessary load on the database/Redis) with zero rate limiting,
   * since that infrastructure doesn't land until Task 32. Defaults to 3s:
   * long enough to bound the amplification to roughly one real check per
   * caller per window, short enough that legitimate monitoring (which
   * typically polls every 5-30s) never sees meaningfully stale data.
   */
  readyCacheMs?: number;
}

async function toStatus(check: DependencyCheck): Promise<HealthCheckStatus> {
  try {
    return (await check()) ? 'ok' : 'down';
  } catch {
    return 'down';
  }
}

interface ReadyResult {
  body: HealthReadyResponse;
  statusCode: 200 | 503;
}

export async function healthRoutes(app: FastifyInstance, opts: HealthRouteOptions = {}) {
  const version = opts.version ?? '0.0.0';
  const checkDatabase = opts.checkDatabase ?? (async () => true);
  const checkRedis = opts.checkRedis ?? (async () => true);
  const checkStorage = opts.checkStorage ?? (async () => true);
  const readyCacheMs = opts.readyCacheMs ?? 3000;

  let cached: { result: ReadyResult; expiresAt: number } | null = null;
  let inFlight: Promise<ReadyResult> | null = null;

  async function computeReady(): Promise<ReadyResult> {
    const [database, redis, storage] = await Promise.all([
      toStatus(checkDatabase),
      toStatus(checkRedis),
      toStatus(checkStorage),
    ]);
    const status = database === 'ok' && redis === 'ok' && storage === 'ok' ? 'ok' : 'degraded';
    const body = healthReadyResponseSchema.parse({ status, checks: { database, redis, storage } });
    return { body, statusCode: status === 'degraded' ? 503 : 200 };
  }

  // live: process is up and can serve traffic. Never depends on downstream
  // services, so it must stay 200 even while the database or Redis is down -
  // that is exactly what should trigger operator attention via `ready`
  // instead of a container restart loop via `live`.
  app.get('/live', async () => {
    return healthLiveResponseSchema.parse({ status: 'ok', version });
  });

  // ready: are this process's dependencies actually usable right now.
  // Task 02 wired this to injectable stub checks (default: always healthy)
  // so the degraded path is provable without real infrastructure; Task 03
  // passes in real database/Redis/storage pings via this same
  // checkDatabase/checkRedis/checkStorage seam. Results are cached for
  // readyCacheMs and concurrent cache-miss requests share one in-flight
  // check (see HealthRouteOptions.readyCacheMs) rather than each triggering
  // its own real dependency check.
  app.get('/ready', async (_request, reply) => {
    const now = Date.now();
    if (!cached || cached.expiresAt <= now) {
      inFlight ??= computeReady();
      const result = await inFlight;
      inFlight = null;
      cached = { result, expiresAt: Date.now() + readyCacheMs };
    }

    reply.code(cached.result.statusCode);
    return cached.result.body;
  });
}
