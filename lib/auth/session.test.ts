import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = 'test-only-session-hmac-key';

// Mirrors services/api/src/modules/auth/session-tokens.ts's signAccessToken
// exactly (same algorithm, same field names) - kept local rather than
// imported across the workspace boundary, since it's only test fixture
// construction, not production logic. Must stay in sync with that file.
function signToken(payload: object, secret: string): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${signature}`;
}

let cookieStore: Map<string, string>;

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieStore.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));

describe('getCurrentUser', () => {
  beforeEach(() => {
    cookieStore = new Map();
    vi.stubEnv('SESSION_HMAC_KEY', SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('returns null when no access_token cookie is present', async () => {
    const { getCurrentUser } = await import('./session');
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it('returns the userId from a validly signed, non-expired token', async () => {
    const now = Math.floor(Date.now() / 1000);
    cookieStore.set('access_token', signToken({ sub: 'user-123', iat: now, exp: now + 900 }, SECRET));

    const { getCurrentUser } = await import('./session');
    await expect(getCurrentUser()).resolves.toEqual({ userId: 'user-123' });
  });

  it('returns null for an expired token', async () => {
    const now = Math.floor(Date.now() / 1000);
    cookieStore.set('access_token', signToken({ sub: 'user-123', iat: now - 1000, exp: now - 100 }, SECRET));

    const { getCurrentUser } = await import('./session');
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it('returns null for a token signed with the wrong secret', async () => {
    const now = Math.floor(Date.now() / 1000);
    cookieStore.set('access_token', signToken({ sub: 'user-123', iat: now, exp: now + 900 }, 'wrong-secret'));

    const { getCurrentUser } = await import('./session');
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it('returns null for a tampered payload (userId swapped, signature no longer matches)', async () => {
    const now = Math.floor(Date.now() / 1000);
    const real = signToken({ sub: 'user-123', iat: now, exp: now + 900 }, SECRET);
    const [payloadB64, signature] = real.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ sub: 'attacker-999', iat: now, exp: now + 900 }), 'utf8').toString(
      'base64url'
    );
    cookieStore.set('access_token', `${tamperedPayload}.${signature}`);

    const { getCurrentUser } = await import('./session');
    await expect(getCurrentUser()).resolves.toBeNull();
    expect(payloadB64).not.toBe(tamperedPayload); // sanity: this really is a different payload
  });

  it('returns null for a structurally malformed cookie value instead of throwing', async () => {
    cookieStore.set('access_token', 'not-a-real-token');
    const { getCurrentUser } = await import('./session');
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it('throws a clear error if SESSION_HMAC_KEY is not configured - never silently treats everyone as logged out', async () => {
    vi.unstubAllEnvs();
    const { getCurrentUser } = await import('./session');
    await expect(getCurrentUser()).rejects.toThrow(/SESSION_HMAC_KEY/);
  });
});
