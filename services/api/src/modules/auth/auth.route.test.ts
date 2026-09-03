import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { authRoutes } from './auth.route';
import {
  LegalVersionChangedError,
  OtpAlreadyUsedError,
  OtpExpiredError,
  OtpInvalidCodeError,
  OtpTooManyAttemptsError,
  RateLimitedError,
  SessionInvalidError,
  SessionReuseDetectedError,
  type AuthService,
  type AuthTokens,
} from './auth.service';
import { DevSmsSinkProvider } from './sms-provider';

const VALID_TOKENS: AuthTokens = {
  userId: '11111111-1111-4111-8111-111111111111',
  accessToken: 'fake-access-token',
  accessTokenTtlSeconds: 900,
  refreshToken: 'fake-refresh-token',
  refreshTokenMaxAgeSeconds: 2_592_000,
};

function buildApp(authService: AuthService, isProduction = false) {
  const app = Fastify();
  app.register(cookie);
  // Mirrors app.ts's real error handler - this file exercises authRoutes in
  // isolation, so the 400-on-malformed-body test needs the same mapping the
  // real app provides (route handlers call schema.parse() directly and let
  // it throw, they don't validate manually).
  app.setErrorHandler((err, _request, reply) => {
    if (err instanceof ZodError) {
      reply.code(400).send({ error: 'VALIDATION_ERROR', issues: err.issues });
      return;
    }
    reply.send(err);
  });
  app.register(authRoutes, {
    prefix: '/v1/auth',
    sessionHmacKey: 'test-only-key',
    phoneEncryptionKey: 'test-only-key',
    smsProvider: new DevSmsSinkProvider(),
    appOrigin: 'https://taavon.example',
    isProduction,
    authService,
  });
  return app;
}

function fakeService(overrides: Partial<AuthService> = {}): AuthService {
  return {
    requestOtp: async () => ({ challengeId: 'challenge-1', expiresInSeconds: 300, termsVersion: 1, privacyVersion: 1 }),
    verifyOtp: async () => VALID_TOKENS,
    refreshSession: async () => VALID_TOKENS,
    logout: async () => undefined,
    ...overrides,
  };
}

describe('POST /otp/request', () => {
  it('returns 202 with the challenge shape', async () => {
    const app = buildApp(fakeService());
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/request',
      payload: { phone: '09121234567', country: 'IR' },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ challengeId: 'challenge-1', expiresInSeconds: 300, termsVersion: 1, privacyVersion: 1 });
    await app.close();
  });

  it('returns 400 for a schema-invalid body (missing country)', async () => {
    const app = buildApp(fakeService());
    const response = await app.inject({ method: 'POST', url: '/v1/auth/otp/request', payload: { phone: '09121234567' } });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('returns 429 with a Retry-After header when rate-limited', async () => {
    const app = buildApp(
      fakeService({
        requestOtp: async () => {
          throw new RateLimitedError(120);
        },
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/request',
      payload: { phone: '09121234567', country: 'IR' },
    });

    expect(response.statusCode).toBe(429);
    expect(response.headers['retry-after']).toBe('120');
    expect(response.json()).toEqual({ error: 'RATE_LIMITED' });
    await app.close();
  });
});

describe('POST /otp/verify', () => {
  const verifyPayload = { challengeId: 'challenge-1', code: '123456', termsVersion: 1, privacyVersion: 1 };

  it('returns 200, sets both cookies with correct attributes, no secure flag outside production', async () => {
    const app = buildApp(fakeService(), false);
    const response = await app.inject({ method: 'POST', url: '/v1/auth/otp/verify', payload: verifyPayload });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ userId: VALID_TOKENS.userId });

    const access = response.cookies.find((c) => c.name === 'access_token')!;
    const refresh = response.cookies.find((c) => c.name === 'refresh_token')!;

    expect(access.value).toBe('fake-access-token');
    expect(access.httpOnly).toBe(true);
    expect(access.sameSite).toBe('Lax');
    expect(access.path).toBe('/');
    expect(access.secure).toBeFalsy();

    expect(refresh.value).toBe('fake-refresh-token');
    expect(refresh.httpOnly).toBe(true);
    expect(refresh.sameSite).toBe('Lax');
    expect(refresh.path).toBe('/v1/auth');

    await app.close();
  });

  it('sets Secure on both cookies in production', async () => {
    const app = buildApp(fakeService(), true);
    const response = await app.inject({ method: 'POST', url: '/v1/auth/otp/verify', payload: verifyPayload });

    for (const name of ['access_token', 'refresh_token']) {
      const found = response.cookies.find((c) => c.name === name)!;
      expect(found.secure).toBe(true);
    }
    await app.close();
  });

  const errorCases: Array<[Error, number, Record<string, unknown>]> = [
    [new OtpExpiredError(), 422, { error: 'OTP_EXPIRED' }],
    [new OtpAlreadyUsedError(), 422, { error: 'OTP_ALREADY_USED' }],
    [new OtpTooManyAttemptsError(), 422, { error: 'OTP_TOO_MANY_ATTEMPTS' }],
    [new OtpInvalidCodeError(), 422, { error: 'OTP_INVALID_CODE' }],
    [
      new LegalVersionChangedError({ termsVersion: 2, privacyVersion: 1, termsUrl: 'https://x/terms', privacyUrl: 'https://x/privacy' }),
      422,
      { error: 'LEGAL_VERSION_CHANGED', current: { termsVersion: 2, privacyVersion: 1, termsUrl: 'https://x/terms', privacyUrl: 'https://x/privacy' } },
    ],
  ];

  for (const [error, expectedStatus, expectedBody] of errorCases) {
    it(`maps ${error.name} to ${expectedStatus}`, async () => {
      const app = buildApp(
        fakeService({
          verifyOtp: async () => {
            throw error;
          },
        })
      );
      const response = await app.inject({ method: 'POST', url: '/v1/auth/otp/verify', payload: verifyPayload });
      expect(response.statusCode).toBe(expectedStatus);
      expect(response.json()).toEqual(expectedBody);
      expect(response.cookies).toHaveLength(0); // no session on any failure path
      await app.close();
    });
  }
});

describe('POST /refresh', () => {
  it('returns 401 and clears cookies when no refresh_token cookie is present', async () => {
    const app = buildApp(fakeService());
    const response = await app.inject({ method: 'POST', url: '/v1/auth/refresh' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'SESSION_INVALID' });
    expect(response.cookies.find((c) => c.name === 'access_token')?.value).toBe('');
    await app.close();
  });

  it('rotates and returns new cookies when a valid refresh_token cookie is presented', async () => {
    const app = buildApp(fakeService());
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      cookies: { refresh_token: 'some-refresh-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.cookies.find((c) => c.name === 'refresh_token')?.value).toBe('fake-refresh-token');
    await app.close();
  });

  it('returns 401 and clears cookies on reuse detection', async () => {
    const app = buildApp(
      fakeService({
        refreshSession: async () => {
          throw new SessionReuseDetectedError();
        },
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      cookies: { refresh_token: 'stolen-token' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'SESSION_INVALID' });
    expect(response.cookies.find((c) => c.name === 'access_token')?.value).toBe('');
    await app.close();
  });

  it('returns 401 for an unknown/invalid refresh token', async () => {
    const app = buildApp(
      fakeService({
        refreshSession: async () => {
          throw new SessionInvalidError();
        },
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      cookies: { refresh_token: 'unknown-token' },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /logout', () => {
  it('returns 204 and clears both cookies, with no refresh_token cookie present', async () => {
    const app = buildApp(fakeService());
    const response = await app.inject({ method: 'POST', url: '/v1/auth/logout' });

    expect(response.statusCode).toBe(204);
    expect(response.cookies.find((c) => c.name === 'access_token')?.value).toBe('');
    expect(response.cookies.find((c) => c.name === 'refresh_token')?.value).toBe('');
    await app.close();
  });

  it('calls logout on the service when a refresh_token cookie is present, and still clears cookies', async () => {
    let calledWith: string | undefined;
    const app = buildApp(
      fakeService({
        logout: async (token) => {
          calledWith = token;
        },
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      cookies: { refresh_token: 'a-real-token' },
    });

    expect(response.statusCode).toBe(204);
    expect(calledWith).toBe('a-real-token');
    await app.close();
  });
});
