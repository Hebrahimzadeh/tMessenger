import type { FastifyReply, FastifyRequest } from 'fastify';
import { apiError } from '../../lib/api-error';
import { ACCESS_TOKEN_COOKIE, InvalidAccessTokenError, verifyAccessToken } from './session-tokens';

export interface SessionUser {
  userId: string;
}

/**
 * Minimal "is there a valid session" gate for routes any authenticated user
 * may call (Task 08's /v1/me, ahead of Task 09's requireRole/authorize.ts,
 * which adds *role*-based checks on top of this same session verification -
 * this stays the one place that actually reads/verifies the cookie).
 *
 * On success returns the user. On failure, sends the 401 SESSION_INVALID
 * envelope itself and returns null - callers must `return` immediately
 * when they get null, since the reply has already been sent.
 */
export function requireSession(
  request: FastifyRequest,
  reply: FastifyReply,
  sessionHmacKey: string,
  now?: () => number
): SessionUser | null {
  const token = request.cookies[ACCESS_TOKEN_COOKIE];
  if (!token) {
    reply.code(401).send(apiError(request, 'SESSION_INVALID', 'برای این عملیات باید وارد شوید.'));
    return null;
  }

  try {
    const payload = verifyAccessToken(token, sessionHmacKey, now);
    return { userId: payload.sub };
  } catch (err) {
    if (err instanceof InvalidAccessTokenError) {
      reply
        .code(401)
        .send(apiError(request, 'SESSION_INVALID', 'نشست شما نامعتبر است یا منقضی شده. لطفاً دوباره وارد شوید.'));
      return null;
    }
    throw err;
  }
}
