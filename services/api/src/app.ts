import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { ZodError } from 'zod';
import { authRoutes, type AuthRouteOptions } from './modules/auth/auth.route';
import { DevSmsSinkProvider } from './modules/auth/sms-provider';
import { healthRoutes, type HealthRouteOptions } from './modules/health/health.route';
import { legalRoutes, type LegalRouteOptions } from './modules/legal/legal-document.route';
import { apiError } from './lib/api-error';

interface PackageJson {
  version: string;
}

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')
) as PackageJson;

export interface BuildAppOptions extends FastifyServerOptions {
  health?: HealthRouteOptions;
  legal?: Partial<LegalRouteOptions>;
  auth?: Partial<AuthRouteOptions>;
  /** Feeds CORS's allow-list and legal's URL resolution; server.ts always passes the real APP_ORIGIN. */
  appOrigin?: string;
}

const DEFAULT_APP_ORIGIN = 'http://localhost:4000';

/**
 * Builds a fully configured Fastify instance without opening a network
 * listener. Safe to import from tests (via `.inject()`) or from `server.ts`
 * (which alone is responsible for calling `.listen()`).
 */
export function buildApp(opts: BuildAppOptions = {}): FastifyInstance {
  const { health, legal, auth, appOrigin, ...fastifyOpts } = opts;
  const resolvedAppOrigin = appOrigin ?? DEFAULT_APP_ORIGIN;

  const app = Fastify({
    logger: true,
    ...fastifyOpts,
  });

  app.register(cookie);

  // Task 06: now that auth uses cookies, CORS must name the web app's exact
  // origin (with credentials: true) rather than reflecting any origin back -
  // a browser will not attach cookies to a cross-origin request otherwise,
  // and reflecting-any-origin plus credentials would be an open CORS hole.
  app.register(cors, { origin: resolvedAppOrigin, credentials: true });

  // Zod's own parse errors (used directly in route handlers, e.g.
  // auth.route.ts's body validation - no route currently uses a Fastify
  // JSON-schema validator) would otherwise surface as an opaque 500;
  // everything else keeps Fastify's normal default handling. Envelope shape
  // is the one every error response uses - see lib/api-error.ts.
  app.setErrorHandler((err, request, reply) => {
    if (err instanceof ZodError) {
      reply.code(400).send(apiError(request, 'VALIDATION_ERROR', 'داده ارسالی معتبر نیست.', err.issues));
      return;
    }
    reply.send(err);
  });

  app.register(healthRoutes, { prefix: '/v1/health', version: pkg.version, ...health });
  app.register(legalRoutes, { prefix: '/v1/legal', appOrigin: resolvedAppOrigin, ...legal });
  app.register(authRoutes, {
    prefix: '/v1/auth',
    sessionHmacKey: 'test-only-default-session-hmac-key-not-for-prod',
    phoneEncryptionKey: 'test-only-default-phone-encryption-key-prod',
    smsProvider: new DevSmsSinkProvider(),
    appOrigin: resolvedAppOrigin,
    isProduction: false,
    ...auth,
  });

  return app;
}
