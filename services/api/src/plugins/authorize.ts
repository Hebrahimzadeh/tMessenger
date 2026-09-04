import type { FastifyReply, FastifyRequest } from 'fastify';
import type { RoleKey } from '@taavon/database';
import { apiError } from '../lib/api-error';
import { requireSession } from '../modules/auth/session-guard';
import { MFA_TOKEN_COOKIE, verifyMfaToken } from '../modules/auth/mfa-token';
import type { RoleAssignmentRepository } from '../modules/auth/role-assignment.repository';

export interface AuthorizeDeps {
  sessionHmacKey: string;
  roleRepo: RoleAssignmentRepository;
}

export interface AuthorizedUser {
  userId: string;
  roles: Set<RoleKey>;
}

/**
 * Deny-by-default role gate (Task 09 interface: "requireRole(...roles) با
 * deny-by-default"). Every route that calls this is by definition an
 * elevated-privilege one - plain USER-level routes (profile, /me) call
 * requireSession directly and never reach here - so a completed MFA
 * challenge (the mfa_token cookie, matched to this exact user) is always
 * required in addition to holding one of `allowedRoles`, satisfying "مدیر
 * بدون challenge دوم به /admin نرسد" uniformly rather than per-route.
 *
 * The role check reads *only* deps.roleRepo's server-side lookup - nothing
 * from the request body/headers/cookies is ever treated as a role claim,
 * so a tampered client has no effect (Task 09 acceptance: "دستکاری client
 * بی‌اثر").
 *
 * Sends the appropriate 401/403 itself and returns null on failure -
 * callers must `return` immediately when they get null.
 */
export function requireRole(...allowedRoles: RoleKey[]) {
  return async function check(
    request: FastifyRequest,
    reply: FastifyReply,
    deps: AuthorizeDeps
  ): Promise<AuthorizedUser | null> {
    const user = requireSession(request, reply, deps.sessionHmacKey);
    if (!user) return null;

    const roles = await deps.roleRepo.getGlobalRoleKeysForUser(user.userId);
    const hasAllowedRole = allowedRoles.some((role) => roles.has(role));
    if (!hasAllowedRole) {
      reply.code(403).send(apiError(request, 'FORBIDDEN', 'دسترسی کافی ندارید.'));
      return null;
    }

    const mfaToken = request.cookies[MFA_TOKEN_COOKIE];
    if (!mfaToken || !verifyMfaToken(mfaToken, deps.sessionHmacKey, user.userId)) {
      reply
        .code(403)
        .send(apiError(request, 'MFA_REQUIRED', 'برای این عملیات نیاز به تأیید دومرحله‌ای دارید.'));
      return null;
    }

    return { userId: user.userId, roles };
  };
}
