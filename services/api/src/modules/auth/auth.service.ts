import { randomUUID } from 'node:crypto';
import type { CurrentLegalDocuments } from '../legal/legal-document.service';
import { encryptPhone, hashPhone } from './phone-crypto';
import { normalizePhone } from './phone';
import {
  generateChallengeId,
  generateOtpCode,
  generateRefreshToken,
  hashOtpCode,
  hashRefreshToken,
  otpCodeMatches,
} from './otp-crypto';
import type { OtpChallengeRepository } from './otp-challenge.repository';
import type { RateLimiter } from './rate-limiter';
import type { SmsProvider } from './sms-provider';
import type { SessionRepository } from './session.repository';
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_MAX_AGE_SECONDS, signAccessToken } from './session-tokens';
import { countryOfE164, hasActiveSmsRoute } from './sms-route-allowlist';

export const OTP_CHALLENGE_TTL_SECONDS = 300;
export const MAX_OTP_ATTEMPTS = 5;
export const OTP_REQUEST_RATE_LIMIT = 3;
export const OTP_REQUEST_RATE_WINDOW_SECONDS = 600;

export class RateLimitedError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super('Too many OTP requests for this number - try again later.');
    this.name = 'RateLimitedError';
  }
}

export class OtpExpiredError extends Error {
  constructor() {
    super('This OTP challenge no longer exists or has expired.');
    this.name = 'OtpExpiredError';
  }
}

export class OtpAlreadyUsedError extends Error {
  constructor() {
    super('This OTP challenge has already been used.');
    this.name = 'OtpAlreadyUsedError';
  }
}

export class OtpTooManyAttemptsError extends Error {
  constructor() {
    super('Too many incorrect attempts for this OTP challenge.');
    this.name = 'OtpTooManyAttemptsError';
  }
}

export class OtpInvalidCodeError extends Error {
  constructor() {
    super('Incorrect OTP code.');
    this.name = 'OtpInvalidCodeError';
  }
}

export class LegalVersionChangedError extends Error {
  constructor(public readonly current: CurrentLegalDocuments) {
    super('The terms/privacy version changed since this challenge was created.');
    this.name = 'LegalVersionChangedError';
  }
}

export class SessionInvalidError extends Error {
  constructor() {
    super('This session is invalid or has expired.');
    this.name = 'SessionInvalidError';
  }
}

export class SessionReuseDetectedError extends Error {
  constructor() {
    super('Refresh token reuse detected - the whole session family has been revoked.');
    this.name = 'SessionReuseDetectedError';
  }
}

export interface RequestOtpInput {
  phone: string;
  country: string;
}

export interface RequestOtpResult {
  challengeId: string;
  expiresInSeconds: number;
  termsVersion: number;
  privacyVersion: number;
}

export interface VerifyOtpInput {
  challengeId: string;
  code: string;
  termsVersion: number;
  privacyVersion: number;
  deviceId?: string | null;
}

export interface AuthTokens {
  userId: string;
  accessToken: string;
  accessTokenTtlSeconds: number;
  refreshToken: string;
  refreshTokenMaxAgeSeconds: number;
}

export interface AuthServiceDeps {
  challengeRepo: OtpChallengeRepository;
  sessionRepo: SessionRepository;
  rateLimiter: RateLimiter;
  smsProvider: SmsProvider;
  sessionHmacKey: string;
  phoneEncryptionKey: string;
  getCurrentLegal: () => Promise<CurrentLegalDocuments>;
  findOrCreateUser: (phoneHash: string, phoneCiphertext: string) => Promise<{ userId: string; created: boolean }>;
  recordAcceptanceAndAudit: (
    userId: string,
    termsVersion: number,
    privacyVersion: number,
    otpChallengeId: string,
    created: boolean
  ) => Promise<void>;
  auditReuseDetected: (userId: string, tokenFamilyId: string) => Promise<void>;
  now?: () => number;
}

export interface AuthService {
  requestOtp(input: RequestOtpInput): Promise<RequestOtpResult>;
  verifyOtp(input: VerifyOtpInput): Promise<AuthTokens>;
  refreshSession(presentedRefreshToken: string, deviceId?: string | null): Promise<AuthTokens>;
  logout(presentedRefreshToken: string): Promise<void>;
}

export function createAuthService(deps: AuthServiceDeps): AuthService {
  const now = deps.now ?? (() => Date.now());

  function issueTokens(userId: string): { accessToken: string; refreshToken: string } {
    return {
      accessToken: signAccessToken(userId, deps.sessionHmacKey, now),
      refreshToken: generateRefreshToken(),
    };
  }

  return {
    async requestOtp(input) {
      // Always resolves the current legal version and always returns 202
      // with a challengeId, regardless of anything about the phone itself
      // (malformed input, unsupported route, existing vs new account) -
      // this uniformity IS the anti-enumeration property under test.
      const current = await deps.getCurrentLegal();

      let phoneE164: string | null;
      try {
        phoneE164 = normalizePhone(input.phone, input.country);
      } catch {
        phoneE164 = null;
      }

      const rateLimitKey = phoneE164
        ? `phone:${hashPhone(phoneE164, deps.phoneEncryptionKey)}`
        : `invalid:${input.country}:${input.phone}`;
      const rateLimit = await deps.rateLimiter.consume(rateLimitKey);
      if (!rateLimit.allowed) {
        throw new RateLimitedError(rateLimit.retryAfterSeconds ?? OTP_REQUEST_RATE_WINDOW_SECONDS);
      }

      const challengeId = generateChallengeId();
      const resolvedCountry = phoneE164 ? countryOfE164(phoneE164) : null;
      const deliverable = phoneE164 !== null && resolvedCountry !== null && hasActiveSmsRoute(resolvedCountry);

      if (deliverable && phoneE164) {
        const code = generateOtpCode();
        await deps.challengeRepo.save(
          challengeId,
          {
            deliverable: true,
            phoneHash: hashPhone(phoneE164, deps.phoneEncryptionKey),
            phoneCiphertext: encryptPhone(phoneE164, deps.phoneEncryptionKey),
            codeHmac: hashOtpCode(code, deps.sessionHmacKey),
            attempts: 0,
            consumed: false,
            termsVersion: current.termsVersion,
            privacyVersion: current.privacyVersion,
          },
          OTP_CHALLENGE_TTL_SECONDS
        );
        await deps.smsProvider.sendOtp(phoneE164, code);
      } else {
        // Non-deliverable: no code exists to send or check against, so any
        // verify attempt against this challengeId fails exactly like a
        // wrong code would - never a distinguishing signal.
        await deps.challengeRepo.save(
          challengeId,
          {
            deliverable: false,
            phoneHash: null,
            phoneCiphertext: null,
            codeHmac: null,
            attempts: 0,
            consumed: false,
            termsVersion: current.termsVersion,
            privacyVersion: current.privacyVersion,
          },
          OTP_CHALLENGE_TTL_SECONDS
        );
      }

      return {
        challengeId,
        expiresInSeconds: OTP_CHALLENGE_TTL_SECONDS,
        termsVersion: current.termsVersion,
        privacyVersion: current.privacyVersion,
      };
    },

    async verifyOtp(input) {
      const challenge = await deps.challengeRepo.get(input.challengeId);
      // "Never existed" and "expired" are indistinguishable by design (both
      // just mean the key is gone from the repository) - see OtpExpiredError.
      if (!challenge) throw new OtpExpiredError();
      if (challenge.consumed) throw new OtpAlreadyUsedError();
      if (challenge.attempts >= MAX_OTP_ATTEMPTS) throw new OtpTooManyAttemptsError();

      const current = await deps.getCurrentLegal();
      const matchesChallengeVersion =
        current.termsVersion === challenge.termsVersion && current.privacyVersion === challenge.privacyVersion;
      const matchesSubmittedVersion =
        input.termsVersion === challenge.termsVersion && input.privacyVersion === challenge.privacyVersion;
      // Checked before the code, and never touches the attempt counter -
      // this isn't a guessing attempt, so it must not consume one of the 5.
      if (!matchesChallengeVersion || !matchesSubmittedVersion) {
        throw new LegalVersionChangedError(current);
      }

      if (!challenge.deliverable || !challenge.codeHmac || !otpCodeMatches(input.code, challenge.codeHmac, deps.sessionHmacKey)) {
        await deps.challengeRepo.incrementAttempts(input.challengeId);
        throw new OtpInvalidCodeError();
      }

      await deps.challengeRepo.markConsumed(input.challengeId);

      const { userId, created } = await deps.findOrCreateUser(challenge.phoneHash!, challenge.phoneCiphertext!);
      await deps.recordAcceptanceAndAudit(userId, current.termsVersion, current.privacyVersion, input.challengeId, created);

      const { accessToken, refreshToken } = issueTokens(userId);
      await deps.sessionRepo.create({
        userId,
        tokenFamilyId: randomUUID(),
        refreshHash: hashRefreshToken(refreshToken),
        expiresAt: new Date(now() + REFRESH_TOKEN_MAX_AGE_SECONDS * 1000),
        deviceId: input.deviceId ?? null,
      });

      return {
        userId,
        accessToken,
        accessTokenTtlSeconds: ACCESS_TOKEN_TTL_SECONDS,
        refreshToken,
        refreshTokenMaxAgeSeconds: REFRESH_TOKEN_MAX_AGE_SECONDS,
      };
    },

    async refreshSession(presentedRefreshToken, deviceId) {
      const hash = hashRefreshToken(presentedRefreshToken);
      const session = await deps.sessionRepo.findByRefreshHash(hash);
      if (!session) throw new SessionInvalidError();

      if (session.revokedAt) {
        // This exact refresh token already rotated away (or was logged
        // out) - presenting it again means it leaked. Revoke every session
        // in the family, not just this one (Task 06 acceptance: "reuse
        // sessionها revoke کند").
        await deps.sessionRepo.revokeFamily(session.tokenFamilyId);
        await deps.auditReuseDetected(session.userId, session.tokenFamilyId);
        throw new SessionReuseDetectedError();
      }

      if (session.expiresAt.getTime() <= now()) {
        throw new SessionInvalidError();
      }

      await deps.sessionRepo.revoke(session.id);
      const { accessToken, refreshToken } = issueTokens(session.userId);
      await deps.sessionRepo.create({
        userId: session.userId,
        tokenFamilyId: session.tokenFamilyId,
        refreshHash: hashRefreshToken(refreshToken),
        // Sliding window: each successful rotation extends the family by a
        // fresh 30 days from now, rather than an absolute cutoff from the
        // original login.
        expiresAt: new Date(now() + REFRESH_TOKEN_MAX_AGE_SECONDS * 1000),
        deviceId: session.deviceId ?? deviceId ?? null,
      });

      return {
        userId: session.userId,
        accessToken,
        accessTokenTtlSeconds: ACCESS_TOKEN_TTL_SECONDS,
        refreshToken,
        refreshTokenMaxAgeSeconds: REFRESH_TOKEN_MAX_AGE_SECONDS,
      };
    },

    async logout(presentedRefreshToken) {
      const hash = hashRefreshToken(presentedRefreshToken);
      const session = await deps.sessionRepo.findByRefreshHash(hash);
      // Idempotent no-op for an unknown/already-revoked token - logout
      // always "succeeds" from the caller's perspective.
      if (session) {
        await deps.sessionRepo.revoke(session.id);
      }
    },
  };
}
