import type { FastifyInstance } from 'fastify';
import {
  otpRequestBodySchema,
  otpRequestResponseSchema,
  otpVerifyBodySchema,
  otpVerifyResponseSchema,
} from '@taavon/contracts';
import {
  createAuthService,
  LegalVersionChangedError,
  OtpAlreadyUsedError,
  OtpExpiredError,
  OtpInvalidCodeError,
  OtpTooManyAttemptsError,
  OTP_REQUEST_RATE_LIMIT,
  OTP_REQUEST_RATE_WINDOW_SECONDS,
  RateLimitedError,
  SessionInvalidError,
  SessionReuseDetectedError,
  type AuthService,
} from './auth.service';
import { auditReuseDetected, recordAcceptanceAndAudit } from './auth-audit';
import { createRedisOtpChallengeRepository } from './otp-challenge.repository';
import { createRedisRateLimiter } from './rate-limiter';
import type { SmsProvider } from './sms-provider';
import { createPrismaSessionRepository } from './session.repository';
import {
  ACCESS_TOKEN_COOKIE,
  accessTokenCookieOptions,
  REFRESH_TOKEN_COOKIE,
  refreshTokenCookieOptions,
} from './session-tokens';
import { findOrCreateUserByPhone } from './user-identity.repository';
import { createPrismaLegalDocumentRepository } from '../legal/legal-document.repository';
import { getCurrentLegalDocuments } from '../legal/legal-document.service';

export interface AuthRouteOptions {
  sessionHmacKey: string;
  phoneEncryptionKey: string;
  smsProvider: SmsProvider;
  appOrigin: string;
  isProduction: boolean;
  /** Test seam - full override, bypasses everything else in this object. */
  authService?: AuthService;
}

function clearAuthCookies(reply: { clearCookie: (name: string, opts?: object) => unknown }): void {
  reply.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/' });
  reply.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/v1/auth' });
}

export async function authRoutes(app: FastifyInstance, opts: AuthRouteOptions) {
  // Built lazily, on first use inside a handler (not here at plugin
  // registration time) - server.ts registers databasePlugin/redisPlugin
  // *after* buildApp() registers this plugin, so app.db/app.redis are still
  // undefined at registration time. See legal-document.route.ts's Task 05
  // Reviewer note for the bug this pattern avoids repeating.
  let cachedService: AuthService | null = opts.authService ?? null;

  function getService(): AuthService {
    if (!cachedService) {
      const prisma = app.db;
      const redis = app.redis;
      cachedService = createAuthService({
        challengeRepo: createRedisOtpChallengeRepository(redis),
        sessionRepo: createPrismaSessionRepository(prisma),
        rateLimiter: createRedisRateLimiter(redis, OTP_REQUEST_RATE_LIMIT, OTP_REQUEST_RATE_WINDOW_SECONDS),
        smsProvider: opts.smsProvider,
        sessionHmacKey: opts.sessionHmacKey,
        phoneEncryptionKey: opts.phoneEncryptionKey,
        getCurrentLegal: () => getCurrentLegalDocuments(createPrismaLegalDocumentRepository(prisma), opts.appOrigin),
        findOrCreateUser: (phoneHash, phoneCiphertext) => findOrCreateUserByPhone(prisma, phoneHash, phoneCiphertext),
        recordAcceptanceAndAudit: (userId, termsVersion, privacyVersion, otpChallengeId, created) =>
          recordAcceptanceAndAudit(prisma, userId, termsVersion, privacyVersion, otpChallengeId, created),
        auditReuseDetected: (userId, tokenFamilyId) => auditReuseDetected(prisma, userId, tokenFamilyId),
      });
    }
    return cachedService;
  }

  app.post('/otp/request', async (request, reply) => {
    const body = otpRequestBodySchema.parse(request.body);

    try {
      const result = await getService().requestOtp(body);
      reply.code(202);
      return otpRequestResponseSchema.parse(result);
    } catch (err) {
      if (err instanceof RateLimitedError) {
        reply.header('Retry-After', String(err.retryAfterSeconds));
        return reply.code(429).send({ error: 'RATE_LIMITED' });
      }
      throw err;
    }
  });

  app.post('/otp/verify', async (request, reply) => {
    const body = otpVerifyBodySchema.parse(request.body);

    try {
      const tokens = await getService().verifyOtp(body);
      reply.setCookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, accessTokenCookieOptions(opts.isProduction));
      reply.setCookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, refreshTokenCookieOptions(opts.isProduction));
      return otpVerifyResponseSchema.parse({ userId: tokens.userId });
    } catch (err) {
      if (err instanceof LegalVersionChangedError) {
        return reply.code(422).send({ error: 'LEGAL_VERSION_CHANGED', current: err.current });
      }
      if (err instanceof OtpExpiredError) return reply.code(422).send({ error: 'OTP_EXPIRED' });
      if (err instanceof OtpAlreadyUsedError) return reply.code(422).send({ error: 'OTP_ALREADY_USED' });
      if (err instanceof OtpTooManyAttemptsError) return reply.code(422).send({ error: 'OTP_TOO_MANY_ATTEMPTS' });
      if (err instanceof OtpInvalidCodeError) return reply.code(422).send({ error: 'OTP_INVALID_CODE' });
      throw err;
    }
  });

  app.post('/refresh', async (request, reply) => {
    const refreshToken = request.cookies[REFRESH_TOKEN_COOKIE];
    if (!refreshToken) {
      clearAuthCookies(reply);
      return reply.code(401).send({ error: 'SESSION_INVALID' });
    }

    try {
      const tokens = await getService().refreshSession(refreshToken);
      reply.setCookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, accessTokenCookieOptions(opts.isProduction));
      reply.setCookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, refreshTokenCookieOptions(opts.isProduction));
      return otpVerifyResponseSchema.parse({ userId: tokens.userId });
    } catch (err) {
      if (err instanceof SessionInvalidError || err instanceof SessionReuseDetectedError) {
        clearAuthCookies(reply);
        return reply.code(401).send({ error: 'SESSION_INVALID' });
      }
      throw err;
    }
  });

  app.post('/logout', async (request, reply) => {
    const refreshToken = request.cookies[REFRESH_TOKEN_COOKIE];
    if (refreshToken) {
      await getService().logout(refreshToken);
    }
    clearAuthCookies(reply);
    return reply.code(204).send();
  });
}
