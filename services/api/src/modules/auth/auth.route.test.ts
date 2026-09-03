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
import { CSRF_COOKIE, CSRF_HEADER } from './csrf';
import { DevSmsSinkProvider, type SmsProvider } from './sms-provider';
import { apiError } from '../../lib/api-error';

const VALID_TOKENS: AuthTokens = {
  userId: '11111111-1111-4111-8111-111111111111',
  accessToken: 'fake-access-token',
  accessTokenTtlSeconds: 900,
  refreshToken: 'fake-refresh-token',
  refreshTokenMaxAgeSeconds: 2_592_000,
};

function buildApp(authService: AuthService, isProduction = false, smsProvider: SmsProvider = new DevSmsSinkProvider()) {
  const app = Fastify();
  app.register(cookie);
  // Mirrors app.ts's real error handler - this file exercises authRoutes in
  // isolation, so the 400-on-malformed-body test needs the same mapping the
  // real app provides (route handlers call schema.parse() directly and let
  // it throw, they don't validate manually).
  app.setErrorHandler((err, request, reply) => {
    if (err instanceof ZodError) {
      reply.code(400).send(apiError(request, 'VALIDATION_ERROR', 'داده ارسالی معتبر نیست.', err.issues));
      return;
    }
    reply.send(err);
  });
  app.register(authRoutes, {
    prefix: '/v1/auth',
    sessionHmacKey: 'test-only-key',
    phoneEncryptionKey: 'test-only-key',
    smsProvider,
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

  it('returns a VALIDATION_ERROR envelope for a schema-invalid body (missing country)', async () => {
    const app = buildApp(fakeService());
    const response = await app.inject({ method: 'POST', url: '/v1/auth/otp/request', payload: { phone: '09121234567' } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    await app.close();
  });

  it('returns 429 with a Retry-After header and a RATE_LIMITED envelope when rate-limited', async () => {
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
    expect(response.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } });
    await app.close();
  });
});

describe('POST /otp/verify', () => {
  const verifyPayload = { challengeId: 'challenge-1', code: '123456', termsVersion: 1, privacyVersion: 1 };

  it('returns 200, sets session + CSRF cookies with correct attributes, no secure flag outside production', async () => {
    const app = buildApp(fakeService(), false);
    const response = await app.inject({ method: 'POST', url: '/v1/auth/otp/verify', payload: verifyPayload });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ userId: VALID_TOKENS.userId });

    const access = response.cookies.find((c) => c.name === 'access_token')!;
    const refresh = response.cookies.find((c) => c.name === 'refresh_token')!;
    const csrf = response.cookies.find((c) => c.name === CSRF_COOKIE)!;

    expect(access.value).toBe('fake-access-token');
    expect(access.httpOnly).toBe(true);
    expect(access.sameSite).toBe('Lax');
    expect(access.path).toBe('/');
    expect(access.secure).toBeFalsy();

    expect(refresh.value).toBe('fake-refresh-token');
    expect(refresh.httpOnly).toBe(true);
    expect(refresh.sameSite).toBe('Lax');
    expect(refresh.path).toBe('/v1/auth');

    expect(csrf.value.length).toBeGreaterThan(0);
    expect(csrf.httpOnly).toBeFalsy(); // must be JS-readable - see csrf.ts
    expect(csrf.path).toBe('/');

    await app.close();
  });

  it('sets Secure on all three cookies in production', async () => {
    const app = buildApp(fakeService(), true);
    const response = await app.inject({ method: 'POST', url: '/v1/auth/otp/verify', payload: verifyPayload });

    for (const name of ['access_token', 'refresh_token', CSRF_COOKIE]) {
      const found = response.cookies.find((c) => c.name === name)!;
      expect(found.secure).toBe(true);
    }
    await app.close();
  });

  const errorCases: Array<[Error, number, string, unknown[]?]> = [
    [new OtpExpiredError(), 422, 'OTP_EXPIRED'],
    [new OtpAlreadyUsedError(), 422, 'OTP_ALREADY_USED'],
    [new OtpTooManyAttemptsError(), 422, 'OTP_TOO_MANY_ATTEMPTS'],
    [new OtpInvalidCodeError(), 422, 'OTP_INVALID_CODE'],
    [
      new LegalVersionChangedError({ termsVersion: 2, privacyVersion: 1, termsUrl: 'https://x/terms', privacyUrl: 'https://x/privacy' }),
      422,
      'LEGAL_VERSION_CHANGED',
      [{ termsVersion: 2, privacyVersion: 1, termsUrl: 'https://x/terms', privacyUrl: 'https://x/privacy' }],
    ],
  ];

  for (const [error, expectedStatus, expectedCode, expectedDetails] of errorCases) {
    it(`maps ${error.name} to ${expectedStatus} with code ${expectedCode}`, async () => {
      const app = buildApp(
        fakeService({
          verifyOtp: async () => {
            throw error;
          },
        })
      );
      const response = await app.inject({ method: 'POST', url: '/v1/auth/otp/verify', payload: verifyPayload });
      expect(response.statusCode).toBe(expectedStatus);
      const body = response.json();
      expect(body.error.code).toBe(expectedCode);
      expect(typeof body.error.message).toBe('string');
      expect(body.error.message.length).toBeGreaterThan(0);
      expect(body.error.correlationId).toBeTruthy();
      if (expectedDetails) expect(body.error.details).toEqual(expectedDetails);
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
    expect(response.json()).toMatchObject({ error: { code: 'SESSION_INVALID' } });
    expect(response.cookies.find((c) => c.name === 'access_token')?.value).toBe('');
    await app.close();
  });

  it('returns 403 CSRF_INVALID when the refresh_token cookie is present but the CSRF header is missing/mismatched', async () => {
    const app = buildApp(fakeService());
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      cookies: { refresh_token: 'some-refresh-token', [CSRF_COOKIE]: 'the-real-csrf-token' },
      // no X-CSRF-Token header at all
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: 'CSRF_INVALID' } });
    await app.close();
  });

  it('rotates and returns new cookies when a valid refresh_token cookie and matching CSRF header are presented', async () => {
    const app = buildApp(fakeService());
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      cookies: { refresh_token: 'some-refresh-token', [CSRF_COOKIE]: 'matching-token' },
      headers: { [CSRF_HEADER]: 'matching-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.cookies.find((c) => c.name === 'refresh_token')?.value).toBe('fake-refresh-token');
    await app.close();
  });

  it('returns 401 and clears cookies on reuse detection (with a valid CSRF pair)', async () => {
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
      cookies: { refresh_token: 'stolen-token', [CSRF_COOKIE]: 'matching-token' },
      headers: { [CSRF_HEADER]: 'matching-token' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'SESSION_INVALID' } });
    expect(response.cookies.find((c) => c.name === 'access_token')?.value).toBe('');
    await app.close();
  });

  it('returns 401 for an unknown/invalid refresh token (with a valid CSRF pair)', async () => {
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
      cookies: { refresh_token: 'unknown-token', [CSRF_COOKIE]: 'matching-token' },
      headers: { [CSRF_HEADER]: 'matching-token' },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /logout', () => {
  it('returns 204 and clears all three cookies, with no refresh_token cookie present', async () => {
    const app = buildApp(fakeService());
    const response = await app.inject({ method: 'POST', url: '/v1/auth/logout' });

    expect(response.statusCode).toBe(204);
    expect(response.cookies.find((c) => c.name === 'access_token')?.value).toBe('');
    expect(response.cookies.find((c) => c.name === 'refresh_token')?.value).toBe('');
    expect(response.cookies.find((c) => c.name === CSRF_COOKIE)?.value).toBe('');
    await app.close();
  });

  it('calls logout on the service when a refresh_token cookie is present, with no CSRF header required', async () => {
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

describe('GET /otp/_dev-sink', () => {
  it('exists and returns the last code sent to a phone number, when the dev sink provider is in use', async () => {
    const smsProvider = new DevSmsSinkProvider();
    await smsProvider.sendOtp('+989121234567', '482913');
    const app = buildApp(fakeService(), false, smsProvider);

    const response = await app.inject({ method: 'GET', url: '/v1/auth/otp/_dev-sink?phone=%2B989121234567' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ code: '482913' });
    await app.close();
  });

  it('returns null for a phone number nothing was sent to', async () => {
    const app = buildApp(fakeService(), false, new DevSmsSinkProvider());
    const response = await app.inject({ method: 'GET', url: '/v1/auth/otp/_dev-sink?phone=%2B989120000000' });
    expect(response.json()).toEqual({ code: null });
    await app.close();
  });

  it('does not exist at all when the configured provider is not the dev sink (i.e. never in production)', async () => {
    const realLookingProvider: SmsProvider = { sendOtp: async () => undefined };
    const app = buildApp(fakeService(), true, realLookingProvider);

    const response = await app.inject({ method: 'GET', url: '/v1/auth/otp/_dev-sink?phone=%2B989121234567' });

    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
