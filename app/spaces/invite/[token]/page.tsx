import { notFound, redirect } from 'next/navigation';
import { resolveSpaceInviteResponseSchema } from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';

interface SpaceInvitePageProps {
  params: Promise<{ token: string }>;
}

/**
 * "صرفاً shortcut عمومی" - resolves the token to a space and redirects
 * there; grants no permission of its own (services/api's resolveInvite
 * already never does). Anonymous, server-side - this endpoint needs no
 * session, so unlike /spaces/[slug] there is no cookie-forwarding
 * limitation to work around here.
 */
export default async function SpaceInvitePage({ params }: SpaceInvitePageProps) {
  const { token } = await params;

  let slug: string;
  try {
    const result = resolveSpaceInviteResponseSchema.parse(await apiFetch(`/spaces/invites/${encodeURIComponent(token)}`));
    slug = result.slug;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  redirect(`/spaces/${slug}`);
}
