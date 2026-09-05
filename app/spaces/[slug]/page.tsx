import { SpacePage } from '@/components/spaces/SpacePage';

interface SpaceRoutePageProps {
  params: Promise<{ slug: string }>;
}

// Client-fetched (no SSR here) rather than a server-side apiFetch, matching
// the same tradeoff Task 08's profile pages already made: a Server
// Component's fetch() has no access to the incoming request's cookies, so
// it could never show the owner/admin view of a not-yet-published space -
// only the browser's own apiFetch call carries the session cookie. A
// PUBLISHED space's page is real content either way; it just isn't
// server-rendered for SEO purposes yet.
export default async function SpaceRoutePage({ params }: SpaceRoutePageProps) {
  const { slug } = await params;
  // A direct navigation to a percent-encoded Persian slug (e.g. a fresh
  // page load, not client-side <Link> routing) arrives here still
  // percent-encoded rather than auto-decoded - confirmed directly via a
  // real browser navigation producing a double-encoded API call
  // (%25D8%25A8...) and a spurious 404. decodeURIComponent is a no-op on
  // an already-decoded string (nothing to unescape), so this is safe
  // regardless of which form `slug` actually arrives in.
  return <SpacePage idOrSlug={decodeURIComponent(slug)} />;
}
