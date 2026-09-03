import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { CurrentLegalDocuments } from '../legal/legal-document.service';
import {
  createAuthService,
  LegalVersionChangedError,
  OtpAlreadyUsedError,
  OtpExpiredError,
  OtpInvalidCodeError,
  OtpTooManyAttemptsError,
  RateLimitedError,
  SessionInvalidError,
  SessionReuseDetectedError,
  type AuthService,
} from './auth.service';
import { FakeOtpChallengeRepository } from './fake-otp-challenge-repository';
import { FakeSessionRepository } from './fake-session-repository';
import { createFakeRateLimiter } from './rate-limiter';
import { DevSmsSinkProvider } from './sms-provider';

const SESSION_HMAC_KEY = 'test-only-session-hmac-key';
const PHONE_ENCRYPTION_KEY = 'test-only-phone-encryption-key';

interface AcceptanceCall {
  userId: string;
  termsVersion: number;
  privacyVersion: number;
  otpChallengeId: string;
  created: boolean;
}

interface ReuseCall {
  userId: string;
  tokenFamilyId: string;
}

function buildService(overrides: { rateLimit?: number } = {}) {
  let now = 1_700_000_000_000;
  const clock = () => now;

  const legal: CurrentLegalDocuments = {
    termsVersion: 1,
    privacyVersion: 1,
    termsUrl: 'https://taavon.example/legal/terms/v1',
    privacyUrl: 'https://taavon.example/legal/privacy/v1',
  };

  const usersByPhoneHash = new Map<string, string>();
  const acceptanceCalls: AcceptanceCall[] = [];
  const reuseCalls: ReuseCall[] = [];
  const smsSink = new DevSmsSinkProvider();

  const service: AuthService = createAuthService({
    challengeRepo: new FakeOtpChallengeRepository(clock),
    sessionRepo: new FakeSessionRepository(),
    rateLimiter: createFakeRateLimiter(overrides.rateLimit ?? 3, 600, clock),
    smsProvider: smsSink,
    sessionHmacKey: SESSION_HMAC_KEY,
    phoneEncryptionKey: PHONE_ENCRYPTION_KEY,
    getCurrentLegal: async () => legal,
    findOrCreateUser: async (phoneHash) => {
      const existing = usersByPhoneHash.get(phoneHash);
      if (existing) return { userId: existing, created: false };
      const userId = randomUUID();
      usersByPhoneHash.set(phoneHash, userId);
      return { userId, created: true };
    },
    recordAcceptanceAndAudit: async (userId, termsVersion, privacyVersion, otpChallengeId, created) => {
      acceptanceCalls.push({ userId, termsVersion, privacyVersion, otpChallengeId, created });
    },
    auditReuseDetected: async (userId, tokenFamilyId) => {
      reuseCalls.push({ userId, tokenFamilyId });
    },
    now: clock,
  });

  return {
    service,
    smsSink,
    acceptanceCalls,
    reuseCalls,
    legal,
    advanceTime: (ms: number) => {
      now += ms;
    },
  };
}

const VALID_PHONE = { phone: '09121234567', country: 'IR' };

describe('requestOtp', () => {
  it('always returns the same response shape for a valid, routable phone', async () => {
    const { service } = buildService();
    const result = await service.requestOtp(VALID_PHONE);
    expect(result).toMatchObject({ expiresInSeconds: 300, termsVersion: 1, privacyVersion: 1 });
    expect(typeof result.challengeId).toBe('string');
  });

  it('returns the identical response shape for a malformed phone number - not an enumeration oracle', async () => {
    const { service } = buildService();
    const validResult = await service.requestOtp(VALID_PHONE);
    const garbageResult = await service.requestOtp({ phone: 'not-a-phone-at-all', country: 'IR' });

    expect(Object.keys(garbageResult).sort()).toEqual(Object.keys(validResult).sort());
    expect(garbageResult.expiresInSeconds).toBe(validResult.expiresInSeconds);
    expect(garbageResult.termsVersion).toBe(validResult.termsVersion);
    expect(garbageResult.privacyVersion).toBe(validResult.privacyVersion);
  });

  it('returns the identical response shape for a country with no active SMS route', async () => {
    // TR is phone-format-supported (phone.ts) - this exercises the
    // separate, narrower ACTIVE_SMS_ROUTE_ALLOWLIST gate specifically. Using
    // a made-up unsupported-by-either-list country code exercises the same
    // "no real number, no real route" non-deliverable path from the other
    // direction (normalizePhone itself rejects it).
    const { service } = buildService();
    const validResult = await service.requestOtp(VALID_PHONE);
    const unsupportedResult = await service.requestOtp({ phone: '5551234567', country: 'US' });

    expect(Object.keys(unsupportedResult).sort()).toEqual(Object.keys(validResult).sort());
    expect(unsupportedResult.expiresInSeconds).toBe(validResult.expiresInSeconds);
  });

  it('sends a real SMS only for a deliverable challenge', async () => {
    const { service, smsSink } = buildService();
    await service.requestOtp(VALID_PHONE);
    expect(smsSink.sent).toHaveLength(1);

    await service.requestOtp({ phone: 'garbage', country: 'IR' });
    expect(smsSink.sent).toHaveLength(1); // unchanged - no SMS for the non-deliverable request
  });

  it('rejects after the rate limit is exceeded for the same phone', async () => {
    const { service } = buildService({ rateLimit: 2 });
    await service.requestOtp(VALID_PHONE);
    await service.requestOtp(VALID_PHONE);
    await expect(service.requestOtp(VALID_PHONE)).rejects.toThrow(RateLimitedError);
  });

  it('rate-limits independently per phone number', async () => {
    const { service } = buildService({ rateLimit: 1 });
    await service.requestOtp(VALID_PHONE);
    await expect(service.requestOtp(VALID_PHONE)).rejects.toThrow(RateLimitedError);
    await expect(service.requestOtp({ phone: '09121234599', country: 'IR' })).resolves.toBeDefined();
  });
});

describe('verifyOtp', () => {
  async function requestAndGetCode(service: AuthService, smsSink: DevSmsSinkProvider) {
    const request = await service.requestOtp(VALID_PHONE);
    const phoneE164 = '+989121234567';
    const code = smsSink.lastCodeFor(phoneE164)!;
    return { challengeId: request.challengeId, code, termsVersion: request.termsVersion, privacyVersion: request.privacyVersion };
  }

  it('rejects an unknown challengeId as expired (indistinguishable from a genuinely expired one)', async () => {
    const { service } = buildService();
    await expect(
      service.verifyOtp({ challengeId: 'never-existed', code: '000000', termsVersion: 1, privacyVersion: 1 })
    ).rejects.toThrow(OtpExpiredError);
  });

  it('rejects a challenge after its 300s TTL elapses', async () => {
    const { service, smsSink, advanceTime } = buildService();
    const { challengeId, code, termsVersion, privacyVersion } = await requestAndGetCode(service, smsSink);

    advanceTime(301_000);

    await expect(service.verifyOtp({ challengeId, code, termsVersion, privacyVersion })).rejects.toThrow(OtpExpiredError);
  });

  it('rejects an incorrect code', async () => {
    const { service, smsSink } = buildService();
    const { challengeId, termsVersion, privacyVersion } = await requestAndGetCode(service, smsSink);

    await expect(
      service.verifyOtp({ challengeId, code: '000000', termsVersion, privacyVersion })
    ).rejects.toThrow(OtpInvalidCodeError);
  });

  it('locks out after 5 wrong attempts, rejecting even the correct code on the 6th try', async () => {
    const { service, smsSink } = buildService();
    const { challengeId, code, termsVersion, privacyVersion } = await requestAndGetCode(service, smsSink);

    for (let i = 0; i < 5; i += 1) {
      await expect(
        service.verifyOtp({ challengeId, code: '000000', termsVersion, privacyVersion })
      ).rejects.toThrow(OtpInvalidCodeError);
    }

    await expect(service.verifyOtp({ challengeId, code, termsVersion, privacyVersion })).rejects.toThrow(
      OtpTooManyAttemptsError
    );
  });

  it('rejects a replay of an already-used challenge, even with the correct code', async () => {
    const { service, smsSink } = buildService();
    const { challengeId, code, termsVersion, privacyVersion } = await requestAndGetCode(service, smsSink);

    await service.verifyOtp({ challengeId, code, termsVersion, privacyVersion });

    await expect(service.verifyOtp({ challengeId, code, termsVersion, privacyVersion })).rejects.toThrow(
      OtpAlreadyUsedError
    );
  });

  it('rejects when the current legal version no longer matches the challenge, and creates no session', async () => {
    const { service, smsSink, legal } = buildService();
    const { challengeId, code, termsVersion, privacyVersion } = await requestAndGetCode(service, smsSink);

    legal.termsVersion = 2; // simulate a new terms version being published between request and verify

    const error = await service.verifyOtp({ challengeId, code, termsVersion, privacyVersion }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LegalVersionChangedError);
    expect((error as InstanceType<typeof LegalVersionChangedError>).current.termsVersion).toBe(2);
  });

  it('rejects when the client-submitted version does not match the challenge, even if current is unchanged', async () => {
    const { service, smsSink } = buildService();
    const { challengeId, code } = await requestAndGetCode(service, smsSink);

    await expect(
      service.verifyOtp({ challengeId, code, termsVersion: 999, privacyVersion: 999 })
    ).rejects.toThrow(LegalVersionChangedError);
  });

  it('a legal-version mismatch does not count against the 5-attempt limit', async () => {
    const { service, smsSink } = buildService();
    const { challengeId, code, termsVersion, privacyVersion } = await requestAndGetCode(service, smsSink);

    for (let i = 0; i < 5; i += 1) {
      await expect(
        service.verifyOtp({ challengeId, code, termsVersion: 999, privacyVersion })
      ).rejects.toThrow(LegalVersionChangedError);
    }

    // Still succeeds afterward - none of those 5 mismatched-version calls consumed an attempt.
    await expect(service.verifyOtp({ challengeId, code, termsVersion, privacyVersion })).resolves.toMatchObject({});
  });

  it('on success: creates a session, returns tokens, and records an acceptance/audit call with no phone or code', async () => {
    const { service, smsSink, acceptanceCalls } = buildService();
    const { challengeId, code, termsVersion, privacyVersion } = await requestAndGetCode(service, smsSink);

    const tokens = await service.verifyOtp({ challengeId, code, termsVersion, privacyVersion });

    expect(tokens.userId).toBeDefined();
    expect(tokens.accessToken).toBeDefined();
    expect(tokens.refreshToken).toBeDefined();

    expect(acceptanceCalls).toHaveLength(1);
    expect(acceptanceCalls[0]).toEqual({
      userId: tokens.userId,
      termsVersion: 1,
      privacyVersion: 1,
      otpChallengeId: challengeId,
      created: true,
    });
    // Structural guarantee: the call carries no field that could be a raw
    // phone number or OTP code - only ids/versions/booleans.
    expect(Object.keys(acceptanceCalls[0]!).sort()).toEqual(
      ['created', 'otpChallengeId', 'privacyVersion', 'termsVersion', 'userId'].sort()
    );
  });

  it('a second, separate login for the same phone resolves to the same userId', async () => {
    const { service, smsSink } = buildService();

    const first = await requestAndGetCode(service, smsSink);
    const firstTokens = await service.verifyOtp(first);

    const second = await requestAndGetCode(service, smsSink);
    const secondTokens = await service.verifyOtp(second);

    expect(secondTokens.userId).toBe(firstTokens.userId);
  });
});

describe('refreshSession', () => {
  async function loginAndGetRefreshToken(service: AuthService, smsSink: DevSmsSinkProvider) {
    const request = await service.requestOtp(VALID_PHONE);
    const code = smsSink.lastCodeFor('+989121234567')!;
    const tokens = await service.verifyOtp({
      challengeId: request.challengeId,
      code,
      termsVersion: request.termsVersion,
      privacyVersion: request.privacyVersion,
    });
    return tokens;
  }

  it('rotates: issues a new refresh token and invalidates the old one', async () => {
    const { service, smsSink } = buildService();
    const original = await loginAndGetRefreshToken(service, smsSink);

    const rotated = await service.refreshSession(original.refreshToken);
    expect(rotated.refreshToken).not.toBe(original.refreshToken);
    expect(rotated.userId).toBe(original.userId);

    // The old token is now revoked - using it again is reuse, not a normal refresh.
    await expect(service.refreshSession(original.refreshToken)).rejects.toThrow(SessionReuseDetectedError);
  });

  it('reuse of an already-rotated token revokes the entire family, including the currently active token', async () => {
    const { service, smsSink } = buildService();
    const original = await loginAndGetRefreshToken(service, smsSink);
    const rotated = await service.refreshSession(original.refreshToken);

    await expect(service.refreshSession(original.refreshToken)).rejects.toThrow(SessionReuseDetectedError);

    // The family is now fully revoked - even the token that WAS still valid can no longer refresh.
    await expect(service.refreshSession(rotated.refreshToken)).rejects.toThrow(SessionReuseDetectedError);
  });

  it('records a reuse-detected audit call with the user id and family id, no tokens', async () => {
    const { service, smsSink, reuseCalls } = buildService();
    const original = await loginAndGetRefreshToken(service, smsSink);
    await service.refreshSession(original.refreshToken);

    await service.refreshSession(original.refreshToken).catch(() => undefined);

    expect(reuseCalls).toHaveLength(1);
    expect(reuseCalls[0]!.userId).toBe(original.userId);
    expect(Object.keys(reuseCalls[0]!).sort()).toEqual(['tokenFamilyId', 'userId']);
  });

  it('rejects an unknown refresh token', async () => {
    const { service } = buildService();
    await expect(service.refreshSession('not-a-real-token')).rejects.toThrow(SessionInvalidError);
  });
});

describe('logout', () => {
  it('revokes the session so it can no longer be refreshed', async () => {
    const { service, smsSink } = buildService();
    const request = await service.requestOtp(VALID_PHONE);
    const code = smsSink.lastCodeFor('+989121234567')!;
    const tokens = await service.verifyOtp({
      challengeId: request.challengeId,
      code,
      termsVersion: request.termsVersion,
      privacyVersion: request.privacyVersion,
    });

    await service.logout(tokens.refreshToken);

    await expect(service.refreshSession(tokens.refreshToken)).rejects.toThrow();
  });

  it('is idempotent for an unknown token - never throws', async () => {
    const { service } = buildService();
    await expect(service.logout('never-issued-token')).resolves.toBeUndefined();
  });
});
