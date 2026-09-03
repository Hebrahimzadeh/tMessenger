import { describe, expect, it } from 'vitest';
import { buildApp } from '../../app';

describe('health routes', () => {
  it('does not open a network listener merely by building the app', async () => {
    const app = buildApp({ logger: false });
    expect(app.server.listening).toBe(false);
    await app.close();
  });

  it('GET /v1/health/live returns 200 with status ok and a version string', async () => {
    const app = buildApp({ logger: false });
    const response = await app.inject({ method: 'GET', url: '/v1/health/live' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', version: expect.any(String) });

    await app.close();
  });

  it('GET /v1/health/live still returns 200 when every dependency check would fail', async () => {
    const app = buildApp({
      logger: false,
      health: {
        checkDatabase: async () => false,
        checkRedis: async () => false,
        checkStorage: async () => false,
      },
    });
    const response = await app.inject({ method: 'GET', url: '/v1/health/live' });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('ok');

    await app.close();
  });

  it('GET /v1/health/ready returns 200 with an ok status when all three dependencies are healthy', async () => {
    const app = buildApp({ logger: false });
    const response = await app.inject({ method: 'GET', url: '/v1/health/ready' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', checks: { database: 'ok', redis: 'ok', storage: 'ok' } });

    await app.close();
  });

  it.each(['checkDatabase', 'checkRedis', 'checkStorage'] as const)(
    'GET /v1/health/ready returns 503 with a degraded status when only %s is down',
    async (failingCheck) => {
      const app = buildApp({
        logger: false,
        health: {
          checkDatabase: async () => true,
          checkRedis: async () => true,
          checkStorage: async () => true,
          [failingCheck]: async () => false,
        },
      });
      const response = await app.inject({ method: 'GET', url: '/v1/health/ready' });

      expect(response.statusCode).toBe(503);
      const body = response.json();
      expect(body.status).toBe('degraded');
      const failedKey = failingCheck.replace('check', '').toLowerCase() as 'database' | 'redis' | 'storage';
      expect(body.checks[failedKey]).toBe('down');

      await app.close();
    }
  );

  it('GET /v1/health/ready caches its result so a burst of unauthenticated calls does not re-check dependencies each time', async () => {
    let calls = 0;
    const app = buildApp({
      logger: false,
      health: {
        checkDatabase: async () => {
          calls += 1;
          return true;
        },
        checkRedis: async () => true,
        checkStorage: async () => true,
        readyCacheMs: 60_000,
      },
    });

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => app.inject({ method: 'GET', url: '/v1/health/ready' }))
    );

    for (const response of responses) {
      expect(response.statusCode).toBe(200);
    }
    expect(calls).toBe(1);

    await app.close();
  });

  it('GET /v1/health/ready re-checks dependencies again once the cache expires', async () => {
    let calls = 0;
    const app = buildApp({
      logger: false,
      health: {
        checkDatabase: async () => {
          calls += 1;
          return true;
        },
        checkRedis: async () => true,
        checkStorage: async () => true,
        readyCacheMs: 1,
      },
    });

    await app.inject({ method: 'GET', url: '/v1/health/ready' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await app.inject({ method: 'GET', url: '/v1/health/ready' });

    expect(calls).toBe(2);

    await app.close();
  });

  it('GET /v1/health/ready treats a throwing dependency check as down, not a 500', async () => {
    const app = buildApp({
      logger: false,
      health: {
        checkDatabase: async () => {
          throw new Error('connection refused');
        },
        checkRedis: async () => true,
        checkStorage: async () => true,
      },
    });
    const response = await app.inject({ method: 'GET', url: '/v1/health/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'degraded', checks: { database: 'down', redis: 'ok', storage: 'ok' } });

    await app.close();
  });
});
