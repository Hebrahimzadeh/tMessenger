import { createHmac, timingSafeEqual } from 'node:crypto';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

export interface AccessTokenPayload {
  sub: string;
  iat: number;
  exp: number;
}

export class InvalidAccessTokenError extends Error {
  constructor() {
    super('Access token is invalid or expired.');
    this.name = 'InvalidAccessTokenError';
  }
}

/**
 * Compact HMAC-signed access token: `base64url(payload).base64url(hmac)`,
 * built with only Node's built-in crypto (same convention as
 * phone-crypto.ts/otp-crypto.ts - no JWT library dependency). Stateless by
 * design: verifying one never hits the database, so a 15-minute lifetime
 * (ACCESS_TOKEN_TTL_SECONDS) is the sole bound on how long a token stays
 * usable after its session is revoked - see auth.service.ts's Reviewer note
 * on this accepted revocation-latency tradeoff.
 */
export function signAccessToken(userId: string, secret: string, now: () => number = () => Date.now()): string {
  const iat = Math.floor(now() / 1000);
  const payload: AccessTokenPayload = { sub: userId, iat, exp: iat + ACCESS_TOKEN_TTL_SECONDS };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${signature}`;
}

export function verifyAccessToken(
  token: string,
  secret: string,
  now: () => number = () => Date.now()
): AccessTokenPayload {
  const parts = token.split('.');
  if (parts.length !== 2) throw new InvalidAccessTokenError();
  const [payloadB64, signature] = parts as [string, string];

  const expectedSignature = createHmac('sha256', secret).update(payloadB64).digest('base64url');
  const supplied = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new InvalidAccessTokenError();
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    throw new InvalidAccessTokenError();
  }

  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof (payload as AccessTokenPayload).sub !== 'string' ||
    typeof (payload as AccessTokenPayload).exp !== 'number' ||
    typeof (payload as AccessTokenPayload).iat !== 'number'
  ) {
    throw new InvalidAccessTokenError();
  }

  const typed = payload as AccessTokenPayload;
  if (typed.exp <= Math.floor(now() / 1000)) {
    throw new InvalidAccessTokenError();
  }

  return typed;
}

interface CookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  maxAge: number;
}

/** Cookie for the stateless access token - path "/" since every route needs it. */
export function accessTokenCookieOptions(isProduction: boolean): CookieOptions {
  return { httpOnly: true, secure: isProduction, sameSite: 'lax', path: '/', maxAge: ACCESS_TOKEN_TTL_SECONDS };
}

/**
 * Cookie for the refresh token - deliberately scoped to /v1/auth only
 * (never sent on ordinary requests), limiting this bearer credential's
 * exposure to just the endpoints that actually need it (refresh, logout).
 */
export function refreshTokenCookieOptions(isProduction: boolean): CookieOptions {
  return { httpOnly: true, secure: isProduction, sameSite: 'lax', path: '/v1/auth', maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS };
}
