import type { FastifyInstance } from 'fastify';
import { mfaCodeBodySchema, mfaEnrollResponseSchema, mfaConfirmResponseSchema, mfaChallengeResponseSchema } from '@taavon/contracts';
import type { PrismaClient } from '@taavon/database';
import { apiError } from '../../lib/api-error';
import { auditMfaConfirmed } from './auth-audit';
import { createPrismaMfaRepository } from './mfa.repository';
import {
  challengeMfa,
  confirmMfa,
  enrollMfa,
  hasActiveMfa,
  InvalidTotpCodeError,
  MfaNotActiveError,
  NoPendingEnrollmentError,
  type MfaRepository,
} from './mfa.service';
import { MFA_TOKEN_COOKIE, mfaTokenCookieOptions, signMfaToken, verifyMfaToken } from './mfa-token';
import { requireSession } from './session-guard';

export interface MfaRouteOptions {
  sessionHmacKey: string;
  phoneEncryptionKey: string;
  isProduction: boolean;
  /** Test seams. */
  mfaRepository?: MfaRepository;
  audit?: (prisma: PrismaClient, userId: string) => Promise<void>;
}

export async function mfaRoutes(app: FastifyInstance, opts: MfaRouteOptions) {
  // Resolved per-request, not at plugin-registration time - same reason as
  // legal-document.route.ts's Task 05 fix: app.db isn't decorated yet when
  // this plugin registers.
  function repo(): MfaRepository {
    return opts.mfaRepository ?? createPrismaMfaRepository(app.db);
  }
  const audit = opts.audit ?? auditMfaConfirmed;

  app.post('/enroll', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;

    // Re-enrolling over an already-ACTIVE setup needs a fresh challenge
    // first - otherwise a session-hijacker (who has the access_token
    // cookie but never passed a second factor) could silently replace the
    // real owner's MFA secret and lock them out.
    if (await hasActiveMfa(repo(), user.userId)) {
      const mfaToken = request.cookies[MFA_TOKEN_COOKIE];
      if (!mfaToken || !verifyMfaToken(mfaToken, opts.sessionHmacKey, user.userId)) {
        return reply
          .code(403)
          .send(apiError(request, 'MFA_REQUIRED', 'برای بازنشانی احراز دومرحله‌ای، ابتدا آن را تأیید کنید.'));
      }
    }

    const result = await enrollMfa(repo(), opts.phoneEncryptionKey, user.userId);
    return mfaEnrollResponseSchema.parse(result);
  });

  app.post('/confirm', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const body = mfaCodeBodySchema.parse(request.body);

    try {
      const result = await confirmMfa(repo(), opts.phoneEncryptionKey, user.userId, body.code);
      await audit(app.db, user.userId);
      reply.setCookie(MFA_TOKEN_COOKIE, signMfaToken(user.userId, opts.sessionHmacKey), mfaTokenCookieOptions(opts.isProduction));
      return mfaConfirmResponseSchema.parse(result);
    } catch (err) {
      if (err instanceof NoPendingEnrollmentError) {
        return reply.code(422).send(apiError(request, 'MFA_NOT_PENDING', 'ابتدا باید ثبت‌نام احراز دومرحله‌ای را شروع کنید.'));
      }
      if (err instanceof InvalidTotpCodeError) {
        return reply.code(422).send(apiError(request, 'MFA_INVALID_CODE', 'کد وارد شده نادرست است.'));
      }
      throw err;
    }
  });

  app.post('/challenge', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const body = mfaCodeBodySchema.parse(request.body);

    try {
      const ok = await challengeMfa(repo(), opts.phoneEncryptionKey, user.userId, body.code);
      if (!ok) {
        return reply.code(422).send(apiError(request, 'MFA_INVALID_CODE', 'کد وارد شده نادرست است.'));
      }
      reply.setCookie(MFA_TOKEN_COOKIE, signMfaToken(user.userId, opts.sessionHmacKey), mfaTokenCookieOptions(opts.isProduction));
      return mfaChallengeResponseSchema.parse({ ok: true });
    } catch (err) {
      if (err instanceof MfaNotActiveError) {
        return reply.code(422).send(apiError(request, 'MFA_NOT_ACTIVE', 'احراز دومرحله‌ای برای این حساب فعال نیست.'));
      }
      throw err;
    }
  });
}
