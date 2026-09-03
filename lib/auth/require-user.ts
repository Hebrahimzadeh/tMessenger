import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentUser, type AuthUser } from './session';

/**
 * Call at the top of a protected Server Component. Returns the current user
 * if one is logged in; otherwise redirects to /login?next=<current path>
 * and never returns (redirect() throws to unwind rendering). The current
 * path comes from the `x-pathname` header middleware.ts sets on every
 * request - a Server Component has no other way to know its own route.
 * middleware.ts already does a cheap presence-only redirect for the common
 * case; this is the authoritative check (real signature+expiry
 * verification via getCurrentUser) that a page must not skip just because
 * middleware let the request through.
 */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (user) return user;

  const headerList = await headers();
  const pathname = headerList.get('x-pathname');
  redirect(pathname ? `/login?next=${encodeURIComponent(pathname)}` : '/login');
}
