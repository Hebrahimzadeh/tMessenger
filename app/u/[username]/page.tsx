import { notFound } from 'next/navigation';
import { publicProfileResponseSchema } from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';
import { PublicProfileView } from '@/components/profile/PublicProfileView';
import { getCurrentUser } from '@/lib/auth/session';

interface PublicProfilePageProps {
  params: Promise<{ username: string }>;
}

export default async function PublicProfilePage({ params }: PublicProfilePageProps) {
  const { username } = await params;

  let profile;
  try {
    profile = publicProfileResponseSchema.parse(await apiFetch(`/users/${encodeURIComponent(username)}`));
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  // A private conversation needs someone to be in it: offered to a signed-in
  // visitor looking at someone else's profile, and to nobody else.
  const viewer = await getCurrentUser();
  const canStartChat = Boolean(viewer && viewer.userId !== profile.userId);

  return <PublicProfileView profile={profile} canStartChat={canStartChat} />;
}
