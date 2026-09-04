import { notFound } from 'next/navigation';
import { publicProfileResponseSchema } from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';
import { PublicProfileView } from '@/components/profile/PublicProfileView';

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

  return <PublicProfileView profile={profile} />;
}
