import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

export interface AuthUser {
  userId: string;
}

const ACCESS_TOKEN_COOKIE = 'access_token';

interface AccessTokenPayload {
  sub: string;
  iat: number;
  exp: number;
}

/**
 * Verifies the access token's HMAC signature and expiry. Mirrors
 * services/api/src/modules/auth/session-tokens.ts's verifyAccessToken
 * exactly (same compact `base64url(payload).base64url(hmac)` format, same
 * SESSION_HMAC_KEY) - the web app has no network path to the API for this
 * check (there is no GET /v1/me yet, and adding one just to answer "is this
 * token valid" would be a real round trip on every protected page render),
 * so it verifies the same stateless token locally instead. Returns null
 * rather than throwing for anything malformed/expired/tampered - the
 * *shape* of the failure never needs to reach a caller of getCurrentUser,
 * only "logged in or not".
 */
function verifyAccessToken(token: string, secret: string): AccessTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, signature] = parts as [string, string];

  const expectedSignature = createHmac('sha256', secret).update(payloadB64).digest('base64url');
  let supplied: Buffer;
  let expected: Buffer;
  try {
    supplied = Buffer.from(signature);
    expected = Buffer.from(expectedSignature);
  } catch {
    return null;
  }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof (payload as AccessTokenPayload).sub !== 'string' ||
    typeof (payload as AccessTokenPayload).exp !== 'number'
  ) {
    return null;
  }

  const typed = payload as AccessTokenPayload;
  if (typed.exp <= Math.floor(Date.now() / 1000)) return null;

  return typed;
}

/**
 * Reads and verifies the access_token cookie in a Server Component/Route
 * Handler. Returns null for "not logged in" (missing, expired, tampered,
 * or malformed token) - callers that must redirect an anonymous visitor
 * should use requireUser() (lib/auth/require-user.ts) instead of checking
 * this directly.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  // Establish request-time rendering before reading runtime-only secrets.
  // Next.js can then skip this path during builds without production keys.
  const store = await cookies();
  const secret = process.env.SESSION_HMAC_KEY;
  if (!secret) {
    // Fails loudly rather than silently treating every visitor as logged
    // out, which would be a much harder misconfiguration to notice.
    throw new Error('SESSION_HMAC_KEY is required (server-side only - never expose this to the browser).');
  }

  const token = store.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return null;

  const payload = verifyAccessToken(token, secret);
  if (!payload) return null;

  return { userId: payload.sub };
}
