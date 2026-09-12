import type { FastifyInstance, FastifyReply } from 'fastify';
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
import { CSRF_COOKIE, csrfCookieOptions, csrfMatches, generateCsrfToken } from './csrf';
import { createRedisOtpChallengeRepository } from './otp-challenge.repository';
import { createRedisRateLimiter } from './rate-limiter';
import { normalizePhone } from './phone';
import { DevSmsSinkProvider, type SmsProvider } from './sms-provider';
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
import { apiError } from '../../lib/api-error';

export interface AuthRouteOptions {
  sessionHmacKey: string;
  phoneEncryptionKey: string;
  smsProvider: SmsProvider;
  appOrigin: string;
  isProduction: boolean;
  /** Test seam - full override, bypasses everything else in this object. */
  authService?: AuthService;
}

function clearAuthCookies(reply: FastifyReply): void {
  reply.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/' });
  reply.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/v1/auth' });
  reply.clearCookie(CSRF_COOKIE, { path: '/' });
}

/** Sets the session + CSRF cookies together - every place a session is (re)issued does all three at once. */
function setSessionCookies(
  reply: FastifyReply,
  tokens: { accessToken: string; refreshToken: string },
  isProduction: boolean
): void {
  reply.setCookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, accessTokenCookieOptions(isProduction));
  reply.setCookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, refreshTokenCookieOptions(isProduction));
  reply.setCookie(CSRF_COOKIE, generateCsrfToken(), csrfCookieOptions(isProduction));
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

  // Test-only diagnostic, impossible to reach in production: it exists only
  // when the *actual* configured provider is the dev sink, and
  // createSmsProvider() never returns that in production (see
  // sms-provider.ts) - so this route's very existence is gated by the same
  // check, not a separate flag that could drift out of sync with it. Lets
  // Playwright E2E specs (tests/e2e/auth.spec.ts) read back the code the
  // dev sink "sent" to a given phone number, since the test runs in a
  // separate process with no other way to observe it.
  if (opts.smsProvider instanceof DevSmsSinkProvider) {
    const devSink = opts.smsProvider;
    app.get<{ Querystring: { phone?: string; country?: string } }>('/otp/_dev-sink', async (request) => {
      const { phone, country } = request.query;
      if (!phone) return { code: null };

      // The sink is keyed by the E.164 number the service actually sent to,
      // but the login screen only has the raw text the person typed. When a
      // country is supplied, normalize with the very same helper requestOtp
      // uses, so the two agree without any of that logic being duplicated
      // into the browser. Callers that already hold E.164 (the Playwright
      // specs) simply omit `country` and are unaffected.
      let lookup = phone;
      if (country) {
        try {
          lookup = normalizePhone(phone, country);
        } catch {
          // Same answer as "no code for that number" - an unparseable phone
          // or unsupported country never had a code sent to it either.
          return { code: null };
        }
      }

      return { code: devSink.lastCodeFor(lookup) ?? null };
    });
  }

  // otp/request and otp/verify are pre-session (no cookie exists yet to
  // double-submit against) - CSRF protection starts at refresh/logout,
  // the first two endpoints that act on an *existing* session.
  app.post('/otp/request', async (request, reply) => {
    const body = otpRequestBodySchema.parse(request.body);

    try {
      const result = await getService().requestOtp(body);
      reply.code(202);
      return otpRequestResponseSchema.parse(result);
    } catch (err) {
      if (err instanceof RateLimitedError) {
        reply.header('Retry-After', String(err.retryAfterSeconds));
        return reply
          .code(429)
          .send(apiError(request, 'RATE_LIMITED', 'درخواست‌های شما بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.'));
      }
      throw err;
    }
  });

  app.post('/otp/verify', async (request, reply) => {
    const body = otpVerifyBodySchema.parse(request.body);

    try {
      const tokens = await getService().verifyOtp(body);
      setSessionCookies(reply, tokens, opts.isProduction);
      return otpVerifyResponseSchema.parse({ userId: tokens.userId });
    } catch (err) {
      if (err instanceof LegalVersionChangedError) {
        return reply
          .code(422)
          .send(
            apiError(
              request,
              'LEGAL_VERSION_CHANGED',
              'قوانین یا حریم خصوصی به‌روزرسانی شده است. لطفاً نسخهٔ جدید را مطالعه و دوباره تلاش کنید.',
              [err.current]
            )
          );
      }
      if (err instanceof OtpExpiredError) {
        return reply
          .code(422)
          .send(apiError(request, 'OTP_EXPIRED', 'کد تأیید منقضی شده یا نامعتبر است. لطفاً دوباره درخواست کد کنید.'));
      }
      if (err instanceof OtpAlreadyUsedError) {
        return reply
          .code(422)
          .send(apiError(request, 'OTP_ALREADY_USED', 'این کد قبلاً استفاده شده است. لطفاً دوباره درخواست کد کنید.'));
      }
      if (err instanceof OtpTooManyAttemptsError) {
        return reply
          .code(422)
          .send(
            apiError(
              request,
              'OTP_TOO_MANY_ATTEMPTS',
              'تعداد تلاش‌های مجاز برای این کد به پایان رسید. لطفاً دوباره درخواست کد کنید.'
            )
          );
      }
      if (err instanceof OtpInvalidCodeError) {
        return reply.code(422).send(apiError(request, 'OTP_INVALID_CODE', 'کد وارد شده نادرست است.'));
      }
      throw err;
    }
  });

  app.post('/refresh', async (request, reply) => {
    const refreshToken = request.cookies[REFRESH_TOKEN_COOKIE];
    if (!refreshToken) {
      clearAuthCookies(reply);
      return reply
        .code(401)
        .send(apiError(request, 'SESSION_INVALID', 'نشست شما نامعتبر است یا منقضی شده. لطفاً دوباره وارد شوید.'));
    }

    if (!csrfMatches(request)) {
      return reply
        .code(403)
        .send(apiError(request, 'CSRF_INVALID', 'درخواست نامعتبر است. صفحه را تازه‌سازی کنید و دوباره تلاش کنید.'));
    }

    try {
      const tokens = await getService().refreshSession(refreshToken);
      setSessionCookies(reply, tokens, opts.isProduction);
      return otpVerifyResponseSchema.parse({ userId: tokens.userId });
    } catch (err) {
      if (err instanceof SessionInvalidError || err instanceof SessionReuseDetectedError) {
        clearAuthCookies(reply);
        return reply
          .code(401)
          .send(apiError(request, 'SESSION_INVALID', 'نشست شما نامعتبر است یا منقضی شده. لطفاً دوباره وارد شوید.'));
      }
      throw err;
    }
  });

  app.post('/logout', async (request, reply) => {
    // No CSRF check here, deliberately: the worst a forged cross-site
    // logout can do is log the victim out, which gains an attacker nothing
    // (unlike /refresh, which performs a real, security-relevant session
    // rotation and reuse-detection check). Requiring CSRF here would only
    // risk a confusing split-brain state - cookies cleared client-side, but
    // the session left un-revoked server-side because the header didn't
    // happen to be attached.
    const refreshToken = request.cookies[REFRESH_TOKEN_COOKIE];
    if (refreshToken) {
      await getService().logout(refreshToken);
    }
    clearAuthCookies(reply);
    return reply.code(204).send();
  });
}
