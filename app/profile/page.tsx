import { requireUser } from '@/lib/auth/require-user';
import { ProfileEditor } from '@/components/profile/ProfileEditor';

export default async function ProfilePage() {
  // The redirect gate only - GET /v1/me itself is fetched client-side by
  // ProfileEditor (a Server Component's own fetch has no access to the
  // browser's cookies).
  await requireUser();
  return <ProfileEditor />;
}
