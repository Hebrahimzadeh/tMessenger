import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Named `proxy.ts` (not the older `middleware.ts`) on purpose: Next.js
 * 16.2.11 has renamed this file convention (the old name still works but
 * `next build` prints "The 'middleware' file convention is deprecated.
 * Please use 'proxy' instead" and the exported function must be named
 * `proxy`, not `middleware` - see next/dist/server/web/types.d.ts's
 * `ProxyConfig`). The plan's own file list already named it `proxy.ts`.
 *
 * Deliberately does ONLY a cheap, presence-only redirect ("Proxy در proxy.ts
 * فقط redirect اولیه انجام دهد؛ authorization در API بماند") - it checks
 * whether an access_token cookie exists at all, nothing more. It never
 * verifies the token's signature or expiry (that needs node:crypto, and
 * would make an Edge-runtime gate on every request do real cryptographic
 * work for no real security gain, since a forged/expired cookie still
 * passes this check). The authoritative check is
 * lib/auth/require-user.ts's requireUser(), called by every protected
 * Server Component, which does the real verification via getCurrentUser()
 * and redirects itself if this proxy's cheap check let through a cookie
 * that doesn't actually hold up.
 */
const PUBLIC_PATHS = ['/login', '/legal/terms', '/legal/privacy', '/system-status'];
// Task 08 extends the public-route list: /u/[username] is a public profile
// page (matches GET /v1/users/:username's own "public profile"
// authorization, not the "user" level GET/PATCH /v1/me needs) - a prefix
// rather than exact-match entry since every username gets its own path.
const PUBLIC_PATH_PREFIXES = ['/u/'];

function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`)) ||
    PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;

  const response = NextResponse.next();
  // Lets Server Components (lib/auth/require-user.ts) learn their own
  // current path via headers() - there is no other way to read it there.
  response.headers.set('x-pathname', pathname);

  if (isPublicPath(pathname)) {
    return response;
  }

  const hasAccessToken = request.cookies.has('access_token');
  if (!hasAccessToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  // Excludes Next's own static/image assets and every existing API route
  // (e.g. /api/gemini, pre-existing and unrelated to this task's auth gate)
  // from the auth check - everything else goes through isPublicPath above.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
