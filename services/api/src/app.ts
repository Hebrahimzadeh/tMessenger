import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { healthRoutes, type HealthRouteOptions } from './modules/health/health.route';

interface PackageJson {
  version: string;
}

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')
) as PackageJson;

export interface BuildAppOptions extends FastifyServerOptions {
  health?: HealthRouteOptions;
}

/**
 * Builds a fully configured Fastify instance without opening a network
 * listener. Safe to import from tests (via `.inject()`) or from `server.ts`
 * (which alone is responsible for calling `.listen()`).
 */
export function buildApp(opts: BuildAppOptions = {}): FastifyInstance {
  const { health, ...fastifyOpts } = opts;

  const app = Fastify({
    logger: true,
    ...fastifyOpts,
  });

  // MVP-stage CORS: the web app and API run on different origins in every
  // environment before the Task 04 reverse proxy unifies them, and no
  // cookie/session auth exists yet to make a permissive origin unsafe.
  // Task 06 (OTP sessions) must tighten this to an explicit allow-list.
  app.register(cors, { origin: true });

  app.register(healthRoutes, { prefix: '/v1/health', version: pkg.version, ...health });

  return app;
}
