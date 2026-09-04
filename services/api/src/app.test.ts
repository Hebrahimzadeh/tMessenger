import { describe, expect, it } from 'vitest';
import { buildApp } from './app';

describe('buildApp: CORS', () => {
  it('always answers with the configured appOrigin - never reflects an arbitrary request Origin back, and never "*" (Task 06 tightened this from origin: true)', async () => {
    const app = buildApp({ logger: false, appOrigin: 'https://taavon.example' });

    // A static string `origin` config makes @fastify/cors answer with that
    // fixed value on every request regardless of the incoming Origin header
    // - the browser's own same-origin check (not the server omitting the
    // header) is what then blocks a script on a different origin from
    // reading the response. The property actually worth pinning down here
    // is that a request claiming to be from an attacker's origin never gets
    // its own origin reflected back, and never gets a wildcard - both of
    // which `origin: true` (the pre-Task-06 config) would have done.
    const fromAttacker = await app.inject({
      method: 'GET',
      url: '/v1/health/live',
      headers: { origin: 'https://attacker.example' },
    });
    expect(fromAttacker.headers['access-control-allow-origin']).toBe('https://taavon.example');
    expect(fromAttacker.headers['access-control-allow-origin']).not.toBe('https://attacker.example');
    expect(fromAttacker.headers['access-control-allow-origin']).not.toBe('*');
    expect(fromAttacker.headers['access-control-allow-credentials']).toBe('true');

    await app.close();
  });

  it('allows PATCH/PUT/DELETE preflights, not just @fastify/cors\'s own GET/HEAD/POST default (Task 08 finding: PATCH /v1/me/profile\'s real preflight failed until this was set explicitly)', async () => {
    const app = buildApp({ logger: false, appOrigin: 'https://taavon.example' });

    for (const method of ['PATCH', 'PUT', 'DELETE']) {
      const preflight = await app.inject({
        method: 'OPTIONS',
        url: '/v1/me/profile',
        headers: {
          origin: 'https://taavon.example',
          'access-control-request-method': method,
          'access-control-request-headers': 'content-type',
        },
      });
      expect(preflight.headers['access-control-allow-methods']).toContain(method);
    }

    await app.close();
  });
});

describe('buildApp: error handling', () => {
  it('maps a Zod validation failure to 400 through the real app (not just an isolated route harness)', async () => {
    const app = buildApp({ logger: false });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/request',
      payload: { phone: '09121234567' }, // missing `country`
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(response.json().error.correlationId).toBeTruthy();

    await app.close();
  });
});
