const DEFAULT_REDIRECT = '/';

/**
 * Validates a post-login "next" redirect target is a safe, internal path -
 * never an absolute URL, a protocol-relative URL (`//evil.example`), or
 * anything containing a scheme (`javascript:`, `https://`, etc.). This is
 * the open-redirect guard Task 07's acceptance requires ("مسیر بازگشت login
 * فقط داخلی و allow-listed"). Anything that doesn't qualify falls back to
 * "/" rather than throwing - a bad/tampered `next` value should never break
 * the login flow, just land the user somewhere safe.
 */
export function sanitizeNextPath(next: string | string[] | null | undefined): string {
  if (typeof next !== 'string' || next.length === 0) return DEFAULT_REDIRECT;
  if (!next.startsWith('/')) return DEFAULT_REDIRECT;
  if (next.startsWith('//')) return DEFAULT_REDIRECT; // protocol-relative URL
  if (next.includes('://')) return DEFAULT_REDIRECT; // any embedded scheme
  if (next.includes('\\')) return DEFAULT_REDIRECT; // backslash-normalization tricks
  if (next === '/login' || next.startsWith('/login?') || next.startsWith('/login/')) return DEFAULT_REDIRECT;
  return next;
}
