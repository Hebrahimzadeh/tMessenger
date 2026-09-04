import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { describe, expect, it, vi } from 'vitest';
import { adminRoutes } from './admin.route';
import { ACCESS_TOKEN_COOKIE, signAccessToken } from '../auth/session-tokens';
import { MFA_TOKEN_COOKIE, signMfaToken } from '../auth/mfa-token';
import type { RoleAssignmentRepository } from '../auth/role-assignment.repository';
import type { IdentityClaimRepository } from '../identity-claim/identity-claim.service';
import type { RoleKey } from '@taavon/database';

const SESSION_HMAC_KEY = 'test-only-session-hmac-key';
const ENCRYPTION_KEY = 'test-only-claim-encryption-key';

function fakeRoleRepo(userRoles: Record<string, RoleKey[]> = {}) {
  const assignments: Array<{ userId: string; roleId: string; assignedBy: string }> = [];
  const repo: RoleAssignmentRepository = {
    async getGlobalRoleKeysForUser(userId) {
      return new Set(userRoles[userId] ?? []);
    },
    async findRoleIdByKey(roleKey) {
      return `role-id-${roleKey}`;
    },
    async assignGlobalRole(userId, roleId, assignedBy) {
      const existing = assignments.find((a) => a.userId === userId && a.roleId === roleId);
      if (existing) return { created: false };
      assignments.push({ userId, roleId, assignedBy });
      return { created: true };
    },
  };
  return { repo, assignments };
}

function fakeClaimRepo(seed: Record<string, { status: 'PENDING' | 'VERIFIED' | 'REJECTED'; evidenceCiphertext: string | null }> = {}) {
  const claims = new Map(Object.entries(seed));
  const repo: IdentityClaimRepository = {
    async findByUserId(userId) {
      const c = claims.get(userId);
      return c ? { status: c.status } : null;
    },
    async findWithEvidenceByUserId(userId) {
      return claims.get(userId) ?? null;
    },
    async upsertPending(userId, evidenceCiphertext) {
      claims.set(userId, { status: 'PENDING', evidenceCiphertext });
    },
    async review(userId, status) {
      const c = claims.get(userId);
      if (c) c.status = status;
    },
    async findPending() {
      return [...claims.entries()].filter(([, c]) => c.status === 'PENDING').map(([userId, c]) => ({ userId, status: c.status }));
    },
  };
  return { repo, claims };
}

function buildApp(
  roleRepo: RoleAssignmentRepository,
  claimRepo: IdentityClaimRepository,
  audit = vi.fn(async (_prisma: unknown, _event: unknown) => undefined)
) {
  const app = Fastify();
  app.register(cookie);
  app.register(adminRoutes, {
    prefix: '/v1/admin',
    sessionHmacKey: SESSION_HMAC_KEY,
    phoneEncryptionKey: ENCRYPTION_KEY,
    roleAssignmentRepository: roleRepo,
    identityClaimRepository: claimRepo,
    audit,
  });
  return { app, audit };
}

function superadminCookies(userId = '11111111-1111-4111-8111-111111111111') {
  return {
    [ACCESS_TOKEN_COOKIE]: signAccessToken(userId, SESSION_HMAC_KEY),
    [MFA_TOKEN_COOKIE]: signMfaToken(userId, SESSION_HMAC_KEY),
  };
}

describe('GET /admin/identity-claims', () => {
  it('requires SUPERADMIN + MFA', async () => {
    const { repo } = fakeRoleRepo({ '22222222-2222-4222-8222-222222222222': [] });
    const { repo: claimRepo } = fakeClaimRepo();
    const { app } = buildApp(repo, claimRepo);
    const response = await app.inject({
      method: 'GET',
      url: '/v1/admin/identity-claims',
      cookies: { [ACCESS_TOKEN_COOKIE]: signAccessToken('22222222-2222-4222-8222-222222222222', SESSION_HMAC_KEY) },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('lists pending claims for a SUPERADMIN with MFA verified', async () => {
    const { repo } = fakeRoleRepo({ '11111111-1111-4111-8111-111111111111': ['SUPERADMIN'] });
    const { repo: claimRepo } = fakeClaimRepo({
      '22222222-2222-4222-8222-222222222222': { status: 'PENDING', evidenceCiphertext: 'x' },
      '33333333-3333-4333-8333-333333333333': { status: 'VERIFIED', evidenceCiphertext: 'y' },
    });
    const { app } = buildApp(repo, claimRepo);
    const response = await app.inject({ method: 'GET', url: '/v1/admin/identity-claims', cookies: superadminCookies() });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ claims: [{ userId: '22222222-2222-4222-8222-222222222222', status: 'PENDING' }] });
    await app.close();
  });
});

describe('GET /admin/identity-claims/:userId', () => {
  it('returns the decrypted evidence for review', async () => {
    const { repo } = fakeRoleRepo({ '11111111-1111-4111-8111-111111111111': ['SUPERADMIN'] });
    const claimRepo = {
      async findByUserId() {
        return { status: 'PENDING' as const };
      },
      async findWithEvidenceByUserId() {
        const { encrypt } = await import('../../lib/symmetric-crypto');
        return { status: 'PENDING' as const, evidenceCiphertext: encrypt('این مدرک است.', ENCRYPTION_KEY) };
      },
      async upsertPending() {},
      async review() {},
      async findPending() {
        return [];
      },
    };
    const { app } = buildApp(repo, claimRepo);
    const response = await app.inject({ method: 'GET', url: '/v1/admin/identity-claims/22222222-2222-4222-8222-222222222222', cookies: superadminCookies() });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'PENDING', evidence: 'این مدرک است.' });
    await app.close();
  });

  it('returns 404 for a user with no claim', async () => {
    const { repo } = fakeRoleRepo({ '11111111-1111-4111-8111-111111111111': ['SUPERADMIN'] });
    const { repo: claimRepo } = fakeClaimRepo();
    const { app } = buildApp(repo, claimRepo);
    const response = await app.inject({ method: 'GET', url: '/v1/admin/identity-claims/44444444-4444-4444-8444-444444444444', cookies: superadminCookies() });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /admin/identity-claims/:userId/verify', () => {
  it('requires SUPERADMIN + MFA', async () => {
    const { repo } = fakeRoleRepo({ '22222222-2222-4222-8222-222222222222': ['MODERATOR'] });
    const { repo: claimRepo } = fakeClaimRepo({ '33333333-3333-4333-8333-333333333333': { status: 'PENDING', evidenceCiphertext: 'x' } });
    const { app } = buildApp(repo, claimRepo);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/identity-claims/33333333-3333-4333-8333-333333333333/verify',
      cookies: { [ACCESS_TOKEN_COOKIE]: signAccessToken('22222222-2222-4222-8222-222222222222', SESSION_HMAC_KEY), [MFA_TOKEN_COOKIE]: signMfaToken('22222222-2222-4222-8222-222222222222', SESSION_HMAC_KEY) },
      payload: { decision: 'VERIFIED' },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('verifies a claim and records an audit event', async () => {
    const { repo } = fakeRoleRepo({ '11111111-1111-4111-8111-111111111111': ['SUPERADMIN'] });
    const { repo: claimRepo, claims } = fakeClaimRepo({ '33333333-3333-4333-8333-333333333333': { status: 'PENDING', evidenceCiphertext: 'x' } });
    const audit = vi.fn(async (_prisma: unknown, _event: unknown) => undefined);
    const { app } = buildApp(repo, claimRepo, audit);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/identity-claims/33333333-3333-4333-8333-333333333333/verify',
      cookies: superadminCookies(),
      payload: { decision: 'VERIFIED' },
    });

    expect(response.statusCode).toBe(200);
    expect(claims.get('33333333-3333-4333-8333-333333333333')?.status).toBe('VERIFIED');
    // Not asserting the first arg (the Prisma client) here - these tests
    // never register the database plugin (repository overrides make it
    // unnecessary), so it's genuinely undefined, which expect.anything()
    // deliberately does not match.
    expect(audit.mock.calls[0]?.[1]).toMatchObject({
      action: 'admin.identity_claim_reviewed',
      actorId: '11111111-1111-4111-8111-111111111111',
      targetId: '33333333-3333-4333-8333-333333333333',
    });
    await app.close();
  });

  it('returns 404 for a nonexistent claim', async () => {
    const { repo } = fakeRoleRepo({ '11111111-1111-4111-8111-111111111111': ['SUPERADMIN'] });
    const { repo: claimRepo } = fakeClaimRepo();
    const { app } = buildApp(repo, claimRepo);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/identity-claims/44444444-4444-4444-8444-444444444444/verify',
      cookies: superadminCookies(),
      payload: { decision: 'REJECTED' },
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /admin/role-assignments', () => {
  it('requires SUPERADMIN + MFA', async () => {
    const { repo } = fakeRoleRepo({ '22222222-2222-4222-8222-222222222222': [] });
    const { repo: claimRepo } = fakeClaimRepo();
    const { app } = buildApp(repo, claimRepo);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/role-assignments',
      cookies: { [ACCESS_TOKEN_COOKIE]: signAccessToken('22222222-2222-4222-8222-222222222222', SESSION_HMAC_KEY) },
      payload: { userId: '33333333-3333-4333-8333-333333333333', role: 'MODERATOR' },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('assigns MODERATOR when the target has a VERIFIED claim, and audits the change', async () => {
    const { repo, assignments } = fakeRoleRepo({ '11111111-1111-4111-8111-111111111111': ['SUPERADMIN'] });
    const { repo: claimRepo } = fakeClaimRepo({ '33333333-3333-4333-8333-333333333333': { status: 'VERIFIED', evidenceCiphertext: 'x' } });
    const audit = vi.fn(async (_prisma: unknown, _event: unknown) => undefined);
    const { app } = buildApp(repo, claimRepo, audit);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/role-assignments',
      cookies: superadminCookies(),
      payload: { userId: '33333333-3333-4333-8333-333333333333', role: 'MODERATOR' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ created: true });
    expect(assignments).toHaveLength(1);
    expect(audit.mock.calls[0]?.[1]).toMatchObject({
      action: 'admin.role_assigned',
      actorId: '11111111-1111-4111-8111-111111111111',
      targetId: '33333333-3333-4333-8333-333333333333',
    });
    await app.close();
  });

  it('returns 422 when the target has no verified claim', async () => {
    const { repo } = fakeRoleRepo({ '11111111-1111-4111-8111-111111111111': ['SUPERADMIN'] });
    const { repo: claimRepo } = fakeClaimRepo();
    const { app } = buildApp(repo, claimRepo);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/role-assignments',
      cookies: superadminCookies(),
      payload: { userId: '33333333-3333-4333-8333-333333333333', role: 'SENIOR_ADMIN' },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ error: { code: 'IDENTITY_CLAIM_NOT_VERIFIED' } });
    await app.close();
  });

  it('a client-supplied role in a header/body has no effect - only the server-side role repo decides authorization', async () => {
    // user-1 has no roles server-side, even though the request smuggles a
    // claim of being SUPERADMIN in an unrelated header.
    const { repo } = fakeRoleRepo({ '22222222-2222-4222-8222-222222222222': [] });
    const { repo: claimRepo } = fakeClaimRepo({ '33333333-3333-4333-8333-333333333333': { status: 'VERIFIED', evidenceCiphertext: 'x' } });
    const { app } = buildApp(repo, claimRepo);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/role-assignments',
      cookies: { [ACCESS_TOKEN_COOKIE]: signAccessToken('22222222-2222-4222-8222-222222222222', SESSION_HMAC_KEY), [MFA_TOKEN_COOKIE]: signMfaToken('22222222-2222-4222-8222-222222222222', SESSION_HMAC_KEY) },
      headers: { 'x-role': 'SUPERADMIN' },
      payload: { userId: '33333333-3333-4333-8333-333333333333', role: 'MODERATOR' },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });
});
