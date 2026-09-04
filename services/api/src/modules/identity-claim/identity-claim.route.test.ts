import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { describe, expect, it } from 'vitest';
import { identityClaimRoutes } from './identity-claim.route';
import { ACCESS_TOKEN_COOKIE, signAccessToken } from '../auth/session-tokens';
import type { IdentityClaimRepository } from './identity-claim.service';

const SESSION_HMAC_KEY = 'test-only-session-hmac-key';
const ENCRYPTION_KEY = 'test-only-claim-encryption-key';

function fakeRepo(): IdentityClaimRepository & { claims: Map<string, { status: string; evidenceCiphertext: string | null }> } {
  const claims = new Map<string, { status: string; evidenceCiphertext: string | null }>();
  return {
    claims,
    async findByUserId(userId) {
      const c = claims.get(userId);
      return c ? { status: c.status as never } : null;
    },
    async findWithEvidenceByUserId(userId) {
      return (claims.get(userId) as never) ?? null;
    },
    async upsertPending(userId, evidenceCiphertext) {
      claims.set(userId, { status: 'PENDING', evidenceCiphertext });
    },
    async review(userId, status) {
      const c = claims.get(userId);
      if (c) c.status = status;
    },
    async findPending() {
      return [...claims.entries()]
        .filter(([, c]) => c.status === 'PENDING')
        .map(([userId, c]) => ({ userId, status: c.status as never }));
    },
  };
}

function buildApp(repo: IdentityClaimRepository) {
  const app = Fastify();
  app.register(cookie);
  app.register(identityClaimRoutes, {
    prefix: '/v1/me',
    sessionHmacKey: SESSION_HMAC_KEY,
    phoneEncryptionKey: ENCRYPTION_KEY,
    identityClaimRepository: repo,
  });
  return app;
}

function sessionCookieFor(userId: string) {
  return { [ACCESS_TOKEN_COOKIE]: signAccessToken(userId, SESSION_HMAC_KEY) };
}

describe('POST /identity-claim', () => {
  it('requires a session', async () => {
    const app = buildApp(fakeRepo());
    const response = await app.inject({ method: 'POST', url: '/v1/me/identity-claim', payload: { evidence: 'x' } });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('submits a claim and stores it encrypted', async () => {
    const repo = fakeRepo();
    const app = buildApp(repo);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/me/identity-claim',
      cookies: sessionCookieFor('user-1'),
      payload: { evidence: 'من مدیر رسمی سازمان X هستم.' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'PENDING' });
    expect(repo.claims.get('user-1')?.evidenceCiphertext).not.toContain('من مدیر رسمی سازمان X هستم.');
    await app.close();
  });

  it('returns 400 for empty evidence', async () => {
    const app = buildApp(fakeRepo());
    app.setErrorHandler((err, request, reply) => {
      reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'x', correlationId: String(request.id), details: [] } });
    });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/me/identity-claim',
      cookies: sessionCookieFor('user-1'),
      payload: { evidence: '' },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});

describe('GET /identity-claim', () => {
  it('requires a session', async () => {
    const app = buildApp(fakeRepo());
    const response = await app.inject({ method: 'GET', url: '/v1/me/identity-claim' });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('returns 404 when no claim was ever submitted', async () => {
    const app = buildApp(fakeRepo());
    const response = await app.inject({ method: 'GET', url: '/v1/me/identity-claim', cookies: sessionCookieFor('user-1') });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('never includes the evidence itself in the own-status view', async () => {
    const repo = fakeRepo();
    const app = buildApp(repo);
    await app.inject({
      method: 'POST',
      url: '/v1/me/identity-claim',
      cookies: sessionCookieFor('user-1'),
      payload: { evidence: 'محرمانه' },
    });
    const response = await app.inject({ method: 'GET', url: '/v1/me/identity-claim', cookies: sessionCookieFor('user-1') });
    expect(Object.keys(response.json())).toEqual(['status']);
    await app.close();
  });
});
