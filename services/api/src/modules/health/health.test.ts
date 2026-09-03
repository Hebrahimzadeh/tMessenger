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

  it('GET /v1/health/live still returns 200 when the database check would fail', async () => {
    const app = buildApp({
      logger: false,
      health: { checkDatabase: async () => false, checkRedis: async () => false },
    });
    const response = await app.inject({ method: 'GET', url: '/v1/health/live' });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('ok');

    await app.close();
  });

  it('GET /v1/health/ready returns 200 with an ok status when all dependencies are healthy', async () => {
    const app = buildApp({ logger: false });
    const response = await app.inject({ method: 'GET', url: '/v1/health/ready' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', checks: { database: 'ok', redis: 'ok' } });

    await app.close();
  });

  it('GET /v1/health/ready returns 503 with a degraded status when a dependency is down', async () => {
    const app = buildApp({
      logger: false,
      health: {
        checkDatabase: async () => false,
        checkRedis: async () => true,
      },
    });
    const response = await app.inject({ method: 'GET', url: '/v1/health/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'degraded', checks: { database: 'down', redis: 'ok' } });

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
      },
    });
    const response = await app.inject({ method: 'GET', url: '/v1/health/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'degraded', checks: { database: 'down', redis: 'ok' } });

    await app.close();
  });
});
