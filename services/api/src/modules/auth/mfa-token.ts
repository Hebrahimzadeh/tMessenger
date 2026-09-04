import { createHmac, timingSafeEqual } from 'node:crypto';

export const MFA_TOKEN_COOKIE = 'mfa_token';
/**
 * How long a completed second-factor challenge is remembered for a session
 * (Task 09 acceptance: "مدیر بدون challenge دوم به /admin نرسد" - an admin
 * cannot reach /admin without the second challenge - but requiring it on
 * every single request, or every 15-minute access-token refresh, would be
 * unreasonably disruptive). 24h is a common "remember 2FA for this login"
 * window; re-challenging daily is the deliberate tradeoff.
 */
export const MFA_TOKEN_TTL_SECONDS = 24 * 60 * 60;

interface MfaTokenPayload {
  sub: string;
  iat: number;
  exp: number;
}

/**
 * A second, independent stateless HMAC-signed token - same compact
 * `base64url(payload).base64url(hmac)` construction as
 * session-tokens.ts's access token, deliberately not shared code with it
 * (see this task's review for why: avoids touching an already-reviewed
 * Task 06 file for a behavior-identical extraction). Kept separate from
 * the access token rather than folded into it as an extra claim, so
 * completing MFA doesn't require re-minting (and the API client re-storing)
 * the access token, and so the two lifetimes (15 min vs 24h) stay
 * independently controllable.
 */
export function signMfaToken(userId: string, secret: string, now: () => number = () => Date.now()): string {
  const iat = Math.floor(now() / 1000);
  const payload: MfaTokenPayload = { sub: userId, iat, exp: iat + MFA_TOKEN_TTL_SECONDS };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${signature}`;
}

/** Returns true only if `token` is a validly signed, non-expired MFA token for exactly `expectedUserId` - never throws. */
export function verifyMfaToken(
  token: string,
  secret: string,
  expectedUserId: string,
  now: () => number = () => Date.now()
): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, signature] = parts as [string, string];

  const expectedSignature = createHmac('sha256', secret).update(payloadB64).digest('base64url');
  const supplied = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return false;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return false;
  }

  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof (payload as MfaTokenPayload).sub !== 'string' ||
    typeof (payload as MfaTokenPayload).exp !== 'number'
  ) {
    return false;
  }

  const typed = payload as MfaTokenPayload;
  if (typed.sub !== expectedUserId) return false;
  if (typed.exp <= Math.floor(now() / 1000)) return false;

  return true;
}

interface MfaTokenCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  maxAge: number;
}

export function mfaTokenCookieOptions(isProduction: boolean): MfaTokenCookieOptions {
  return { httpOnly: true, secure: isProduction, sameSite: 'lax', path: '/', maxAge: MFA_TOKEN_TTL_SECONDS };
}
