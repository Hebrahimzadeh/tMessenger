import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { describe, expect, it, vi } from 'vitest';
import { mfaRoutes } from './mfa.route';
import { ACCESS_TOKEN_COOKIE, signAccessToken } from './session-tokens';
import { MFA_TOKEN_COOKIE, verifyMfaToken } from './mfa-token';
import { computeTotpCode } from './totp';
import type { MfaRepository } from './mfa.service';

const SESSION_HMAC_KEY = 'test-only-session-hmac-key';
const ENCRYPTION_KEY = 'test-only-mfa-encryption-key';

function fakeMfaRepo(): MfaRepository {
  const enrollments = new Map<string, { status: 'PENDING' | 'ACTIVE'; secretCiphertext: string }>();
  const recoveryCodes = new Map<string, { userId: string; codeHash: string; usedAt: Date | null }>();
  let nextId = 1;

  return {
    async findEnrollment(userId) {
      return enrollments.get(userId) ?? null;
    },
    async upsertPendingEnrollment(userId, secretCiphertext) {
      enrollments.set(userId, { status: 'PENDING', secretCiphertext });
    },
    async activateEnrollment(userId, hashes) {
      const e = enrollments.get(userId)!;
      e.status = 'ACTIVE';
      for (const codeHash of hashes) recoveryCodes.set(`${nextId++}`, { userId, codeHash, usedAt: null });
    },
    async findUnusedRecoveryCodeByHash(userId, codeHash) {
      for (const [id, rc] of recoveryCodes) {
        if (rc.userId === userId && rc.codeHash === codeHash && !rc.usedAt) return { id };
      }
      return null;
    },
    async markRecoveryCodeUsed(id) {
      const rc = recoveryCodes.get(id);
      if (rc) rc.usedAt = new Date();
    },
  };
}

function buildApp(mfaRepository: MfaRepository, isProduction = false) {
  const app = Fastify();
  app.register(cookie);
  app.register(mfaRoutes, {
    prefix: '/v1/auth/mfa',
    sessionHmacKey: SESSION_HMAC_KEY,
    phoneEncryptionKey: ENCRYPTION_KEY,
    isProduction,
    mfaRepository,
    audit: vi.fn(async () => undefined),
  });
  return app;
}

function sessionCookieFor(userId: string) {
  return { [ACCESS_TOKEN_COOKIE]: signAccessToken(userId, SESSION_HMAC_KEY) };
}

describe('POST /enroll', () => {
  it('requires a session', async () => {
    const app = buildApp(fakeMfaRepo());
    const response = await app.inject({ method: 'POST', url: '/v1/auth/mfa/enroll' });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('returns a secret and otpauth URI for a first-time enrollment', async () => {
    const app = buildApp(fakeMfaRepo());
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/mfa/enroll',
      cookies: sessionCookieFor('user-1'),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.secretBase32).toMatch(/^[A-Z2-7]+$/);
    expect(body.otpauthUri).toContain('otpauth://totp/');
    await app.close();
  });

  it('allows re-enrolling when not yet ACTIVE, without needing an MFA challenge', async () => {
    const repo = fakeMfaRepo();
    const app = buildApp(repo);
    await app.inject({ method: 'POST', url: '/v1/auth/mfa/enroll', cookies: sessionCookieFor('user-1') });
    const second = await app.inject({ method: 'POST', url: '/v1/auth/mfa/enroll', cookies: sessionCookieFor('user-1') });
    expect(second.statusCode).toBe(200);
    await app.close();
  });

  it('requires a fresh MFA challenge to re-enroll once already ACTIVE (prevents a session-hijacker from silently resetting MFA)', async () => {
    const repo = fakeMfaRepo();
    const app = buildApp(repo);
    const enrollResponse = await app.inject({ method: 'POST', url: '/v1/auth/mfa/enroll', cookies: sessionCookieFor('user-1') });
    const { secretBase32 } = enrollResponse.json();
    await app.inject({
      method: 'POST',
      url: '/v1/auth/mfa/confirm',
      cookies: sessionCookieFor('user-1'),
      payload: { code: computeTotpCode(secretBase32) },
    });

    const reEnroll = await app.inject({ method: 'POST', url: '/v1/auth/mfa/enroll', cookies: sessionCookieFor('user-1') });
    expect(reEnroll.statusCode).toBe(403);
    expect(reEnroll.json()).toMatchObject({ error: { code: 'MFA_REQUIRED' } });
    await app.close();
  });
});

describe('POST /confirm', () => {
  it('activates MFA, returns 10 recovery codes, and sets the mfa_token cookie', async () => {
    const app = buildApp(fakeMfaRepo());
    const enrollResponse = await app.inject({ method: 'POST', url: '/v1/auth/mfa/enroll', cookies: sessionCookieFor('user-1') });
    const { secretBase32 } = enrollResponse.json();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/mfa/confirm',
      cookies: sessionCookieFor('user-1'),
      payload: { code: computeTotpCode(secretBase32) },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().recoveryCodes).toHaveLength(10);

    const mfaCookie = response.cookies.find((c) => c.name === MFA_TOKEN_COOKIE);
    expect(mfaCookie?.httpOnly).toBe(true);
    expect(verifyMfaToken(mfaCookie!.value, SESSION_HMAC_KEY, 'user-1')).toBe(true);
    await app.close();
  });

  it('returns 422 for a wrong code, and does not set a cookie', async () => {
    const app = buildApp(fakeMfaRepo());
    await app.inject({ method: 'POST', url: '/v1/auth/mfa/enroll', cookies: sessionCookieFor('user-1') });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/mfa/confirm',
      cookies: sessionCookieFor('user-1'),
      payload: { code: '000000' },
    });
    expect(response.statusCode).toBe(422);
    expect(response.cookies).toHaveLength(0);
    await app.close();
  });

  it('returns 422 when there is nothing pending to confirm', async () => {
    const app = buildApp(fakeMfaRepo());
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/mfa/confirm',
      cookies: sessionCookieFor('user-1'),
      payload: { code: '123456' },
    });
    expect(response.statusCode).toBe(422);
    await app.close();
  });
});

describe('POST /challenge', () => {
  async function activatedApp() {
    const repo = fakeMfaRepo();
    const app = buildApp(repo);
    const enrollResponse = await app.inject({ method: 'POST', url: '/v1/auth/mfa/enroll', cookies: sessionCookieFor('user-1') });
    const { secretBase32 } = enrollResponse.json();
    const confirmResponse = await app.inject({
      method: 'POST',
      url: '/v1/auth/mfa/confirm',
      cookies: sessionCookieFor('user-1'),
      payload: { code: computeTotpCode(secretBase32) },
    });
    return { app, secretBase32, recoveryCodes: confirmResponse.json().recoveryCodes as string[] };
  }

  it('sets the mfa_token cookie for a correct TOTP code', async () => {
    const { app, secretBase32 } = await activatedApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/mfa/challenge',
      cookies: sessionCookieFor('user-1'),
      payload: { code: computeTotpCode(secretBase32) },
    });
    expect(response.statusCode).toBe(200);
    expect(response.cookies.find((c) => c.name === MFA_TOKEN_COOKIE)).toBeTruthy();
    await app.close();
  });

  it('accepts a valid recovery code and consumes it (fails on reuse)', async () => {
    const { app, recoveryCodes } = await activatedApp();
    const code = recoveryCodes[0]!;

    const first = await app.inject({
      method: 'POST',
      url: '/v1/auth/mfa/challenge',
      cookies: sessionCookieFor('user-1'),
      payload: { code },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: '/v1/auth/mfa/challenge',
      cookies: sessionCookieFor('user-1'),
      payload: { code },
    });
    expect(second.statusCode).toBe(422);
    await app.close();
  });

  it('returns 422 for an incorrect code', async () => {
    const { app } = await activatedApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/mfa/challenge',
      cookies: sessionCookieFor('user-1'),
      payload: { code: '000000' },
    });
    expect(response.statusCode).toBe(422);
    await app.close();
  });

  it('returns 422 when MFA was never activated', async () => {
    const app = buildApp(fakeMfaRepo());
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/mfa/challenge',
      cookies: sessionCookieFor('user-1'),
      payload: { code: '123456' },
    });
    expect(response.statusCode).toBe(422);
    await app.close();
  });
});
