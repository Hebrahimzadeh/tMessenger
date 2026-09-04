import { describe, expect, it, vi } from 'vitest';
import { requireRole } from './authorize';
import { ACCESS_TOKEN_COOKIE, signAccessToken } from '../modules/auth/session-tokens';
import { MFA_TOKEN_COOKIE, signMfaToken } from '../modules/auth/mfa-token';
import type { RoleAssignmentRepository } from '../modules/auth/role-assignment.repository';
import type { RoleKey } from '@taavon/database';

const SESSION_HMAC_KEY = 'test-only-session-hmac-key';

function fakeRequest(cookies: Record<string, string | undefined>, body: unknown = {}) {
  return { cookies, body, id: 'req-1' } as unknown as import('fastify').FastifyRequest;
}

function fakeReply() {
  const reply = { code: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() };
  return reply as unknown as import('fastify').FastifyReply & { code: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> };
}

function fakeRoleRepo(roles: RoleKey[]): RoleAssignmentRepository {
  return {
    async getGlobalRoleKeysForUser() {
      return new Set(roles);
    },
    async findRoleIdByKey() {
      return null;
    },
    async assignGlobalRole() {
      return { created: false };
    },
  };
}

function validSessionCookie(userId: string) {
  return signAccessToken(userId, SESSION_HMAC_KEY);
}

function validMfaCookie(userId: string) {
  return signMfaToken(userId, SESSION_HMAC_KEY);
}

describe('requireRole', () => {
  it('returns null and sends 401 with no session at all', async () => {
    const reply = fakeReply();
    const result = await requireRole('SUPERADMIN')(fakeRequest({}), reply, {
      sessionHmacKey: SESSION_HMAC_KEY,
      roleRepo: fakeRoleRepo(['SUPERADMIN']),
    });
    expect(result).toBeNull();
    expect(reply.code).toHaveBeenCalledWith(401);
  });

  it('returns null and sends 403 FORBIDDEN when the user has a session but none of the allowed roles', async () => {
    const reply = fakeReply();
    const result = await requireRole('SUPERADMIN')(
      fakeRequest({ [ACCESS_TOKEN_COOKIE]: validSessionCookie('user-1') }),
      reply,
      { sessionHmacKey: SESSION_HMAC_KEY, roleRepo: fakeRoleRepo([]) }
    );
    expect(result).toBeNull();
    expect(reply.code).toHaveBeenCalledWith(403);
    const [body] = reply.send.mock.calls[0] as [{ error: { code: string } }];
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns null and sends 403 MFA_REQUIRED when the role matches but no mfa_token cookie is present', async () => {
    const reply = fakeReply();
    const result = await requireRole('SUPERADMIN')(
      fakeRequest({ [ACCESS_TOKEN_COOKIE]: validSessionCookie('user-1') }),
      reply,
      { sessionHmacKey: SESSION_HMAC_KEY, roleRepo: fakeRoleRepo(['SUPERADMIN']) }
    );
    expect(result).toBeNull();
    expect(reply.code).toHaveBeenCalledWith(403);
    const [body] = reply.send.mock.calls[0] as [{ error: { code: string } }];
    expect(body.error.code).toBe('MFA_REQUIRED');
  });

  it('returns null and sends 403 MFA_REQUIRED when the mfa_token cookie belongs to a different user', async () => {
    const reply = fakeReply();
    const result = await requireRole('SUPERADMIN')(
      fakeRequest({
        [ACCESS_TOKEN_COOKIE]: validSessionCookie('user-1'),
        [MFA_TOKEN_COOKIE]: validMfaCookie('someone-else'),
      }),
      reply,
      { sessionHmacKey: SESSION_HMAC_KEY, roleRepo: fakeRoleRepo(['SUPERADMIN']) }
    );
    expect(result).toBeNull();
    expect(reply.code).toHaveBeenCalledWith(403);
  });

  it('returns the authorized user when the role matches and MFA is verified', async () => {
    const reply = fakeReply();
    const result = await requireRole('SUPERADMIN')(
      fakeRequest({
        [ACCESS_TOKEN_COOKIE]: validSessionCookie('user-1'),
        [MFA_TOKEN_COOKIE]: validMfaCookie('user-1'),
      }),
      reply,
      { sessionHmacKey: SESSION_HMAC_KEY, roleRepo: fakeRoleRepo(['SUPERADMIN']) }
    );
    expect(result).toEqual({ userId: 'user-1', roles: new Set(['SUPERADMIN']) });
    expect(reply.code).not.toHaveBeenCalled();
  });

  it('accepts any one of several allowed roles', async () => {
    const reply = fakeReply();
    const result = await requireRole('MODERATOR', 'SENIOR_ADMIN')(
      fakeRequest({
        [ACCESS_TOKEN_COOKIE]: validSessionCookie('user-1'),
        [MFA_TOKEN_COOKIE]: validMfaCookie('user-1'),
      }),
      reply,
      { sessionHmacKey: SESSION_HMAC_KEY, roleRepo: fakeRoleRepo(['MODERATOR']) }
    );
    expect(result).not.toBeNull();
  });

  it('OPS is rejected by a MODERATOR-only check - role separation is real, not just documented', async () => {
    const reply = fakeReply();
    const result = await requireRole('MODERATOR', 'SENIOR_ADMIN', 'SUPERADMIN')(
      fakeRequest({
        [ACCESS_TOKEN_COOKIE]: validSessionCookie('user-1'),
        [MFA_TOKEN_COOKIE]: validMfaCookie('user-1'),
      }),
      reply,
      { sessionHmacKey: SESSION_HMAC_KEY, roleRepo: fakeRoleRepo(['OPS']) }
    );
    expect(result).toBeNull();
    expect(reply.code).toHaveBeenCalledWith(403);
  });

  it('ignores a client-supplied role claim entirely - only the server-side role repository lookup decides', async () => {
    const reply = fakeReply();
    // A tampered client sends a body claiming to be SUPERADMIN, but the
    // server-side lookup (the only source of truth) says they have no roles.
    const result = await requireRole('SUPERADMIN')(
      fakeRequest({ [ACCESS_TOKEN_COOKIE]: validSessionCookie('user-1') }, { role: 'SUPERADMIN', roles: ['SUPERADMIN'] }),
      reply,
      { sessionHmacKey: SESSION_HMAC_KEY, roleRepo: fakeRoleRepo([]) }
    );
    expect(result).toBeNull();
    expect(reply.code).toHaveBeenCalledWith(403);
  });

  it('deny-by-default: an empty allowed-roles list denies everyone, even a SUPERADMIN', async () => {
    const reply = fakeReply();
    const result = await requireRole()(
      fakeRequest({
        [ACCESS_TOKEN_COOKIE]: validSessionCookie('user-1'),
        [MFA_TOKEN_COOKIE]: validMfaCookie('user-1'),
      }),
      reply,
      { sessionHmacKey: SESSION_HMAC_KEY, roleRepo: fakeRoleRepo(['SUPERADMIN']) }
    );
    expect(result).toBeNull();
    expect(reply.code).toHaveBeenCalledWith(403);
  });
});
