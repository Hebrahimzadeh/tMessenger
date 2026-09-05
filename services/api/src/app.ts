import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { ZodError } from 'zod';
import { adminRoutes, type AdminRouteOptions } from './modules/admin/admin.route';
import { authRoutes, type AuthRouteOptions } from './modules/auth/auth.route';
import { mfaRoutes, type MfaRouteOptions } from './modules/auth/mfa.route';
import { DevSmsSinkProvider } from './modules/auth/sms-provider';
import { healthRoutes, type HealthRouteOptions } from './modules/health/health.route';
import { identityClaimRoutes, type IdentityClaimRouteOptions } from './modules/identity-claim/identity-claim.route';
import { legalRoutes, type LegalRouteOptions } from './modules/legal/legal-document.route';
import { profileRoutes, type ProfileRouteOptions } from './modules/profile/profile.route';
import { spaceSearchRoutes, type SpaceSearchRouteOptions } from './modules/spaces/space-search.route';
import { spaceRoutes, type SpaceRouteOptions } from './modules/spaces/space.route';
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
  profile?: Partial<ProfileRouteOptions>;
  mfa?: Partial<MfaRouteOptions>;
  identityClaim?: Partial<IdentityClaimRouteOptions>;
  admin?: Partial<AdminRouteOptions>;
  spaces?: Partial<SpaceRouteOptions>;
  spaceSearch?: Partial<SpaceSearchRouteOptions>;
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
  const { health, legal, auth, profile, mfa, identityClaim, admin, spaces, spaceSearch, appOrigin, ...fastifyOpts } = opts;
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
  //
  // `methods` is explicit and covers the full REST verb set on purpose:
  // @fastify/cors's own default is only GET,HEAD,POST, which silently
  // fails the preflight for anything else. That went unnoticed through
  // Tasks 06-07 because every route so far was GET or POST; Task 08's
  // PATCH /v1/me/profile was the first real cross-origin PATCH and its
  // preflight failed outright (confirmed via a direct curl OPTIONS check,
  // not just theory) until this was added. PUT/DELETE aren't used yet
  // either, but later tasks' endpoint table already calls for both
  // (e.g. PUT/DELETE .../reactions/:type) - setting the real full set now
  // avoids rediscovering this exact bug a third time.
  app.register(cors, {
    origin: resolvedAppOrigin,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE'],
  });

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
  app.register(profileRoutes, {
    prefix: '/v1',
    sessionHmacKey: 'test-only-default-session-hmac-key-not-for-prod',
    phoneEncryptionKey: 'test-only-default-phone-encryption-key-prod',
    ...profile,
  });
  app.register(mfaRoutes, {
    prefix: '/v1/auth/mfa',
    sessionHmacKey: 'test-only-default-session-hmac-key-not-for-prod',
    phoneEncryptionKey: 'test-only-default-phone-encryption-key-prod',
    isProduction: false,
    ...mfa,
  });
  app.register(identityClaimRoutes, {
    prefix: '/v1/me',
    sessionHmacKey: 'test-only-default-session-hmac-key-not-for-prod',
    phoneEncryptionKey: 'test-only-default-phone-encryption-key-prod',
    ...identityClaim,
  });
  app.register(adminRoutes, {
    prefix: '/v1/admin',
    sessionHmacKey: 'test-only-default-session-hmac-key-not-for-prod',
    phoneEncryptionKey: 'test-only-default-phone-encryption-key-prod',
    ...admin,
  });
  app.register(spaceRoutes, {
    prefix: '/v1/spaces',
    sessionHmacKey: 'test-only-default-session-hmac-key-not-for-prod',
    ...spaces,
  });
  app.register(spaceSearchRoutes, {
    prefix: '/v1/spaces',
    sessionHmacKey: 'test-only-default-session-hmac-key-not-for-prod',
    ...spaceSearch,
  });

  return app;
}
