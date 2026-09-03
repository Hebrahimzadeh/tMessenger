import { randomBytes, timingSafeEqual } from 'node:crypto';

export const CSRF_COOKIE = 'csrf_token';
export const CSRF_HEADER = 'x-csrf-token';

/** CSPRNG double-submit CSRF token - no secret/signing needed, same reasoning as a refresh token (session-tokens.ts): the value's own entropy is what makes it unguessable. */
export function generateCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}

interface CsrfCookieOptions {
  httpOnly: false;
  secure: boolean;
  sameSite: 'lax';
  path: string;
}

/**
 * Deliberately NOT HttpOnly: the browser's own JS must be able to read this
 * cookie to echo its value back as the X-CSRF-Token header (the
 * "double-submit cookie" pattern). This is what makes it useful against
 * CSRF specifically - a cross-site attacker's page can make the victim's
 * browser *send* this cookie automatically, but same-origin policy stops
 * that attacker's script from *reading* it to put the matching value in a
 * header, so a forged cross-site request can never supply both.
 */
export function csrfCookieOptions(isProduction: boolean): CsrfCookieOptions {
  return { httpOnly: false, secure: isProduction, sameSite: 'lax', path: '/' };
}

interface CsrfCheckableRequest {
  cookies: Record<string, string | undefined>;
  headers: Record<string, unknown>;
}

/** Constant-time comparison of the CSRF cookie against the X-CSRF-Token header. False (not a throw) for anything missing or malformed. */
export function csrfMatches(request: CsrfCheckableRequest): boolean {
  const cookieValue = request.cookies[CSRF_COOKIE];
  const headerValue = request.headers[CSRF_HEADER];
  if (!cookieValue || typeof headerValue !== 'string' || !headerValue) return false;

  const a = Buffer.from(cookieValue);
  const b = Buffer.from(headerValue);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
