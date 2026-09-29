import { requireUser } from '@/lib/auth/require-user';
import { SpaceBuildReview } from '@/components/admin/SpaceBuildReview';

export default async function AdminSpaceBuildsPage() {
  // Only the login-required gate - SUPERADMIN + MFA are enforced server-side
  // by GET /v1/admin/space-builds itself, never trusted client-side (same
  // division of responsibility as app/admin/page.tsx and /admin/metrics).
  await requireUser();
  return <SpaceBuildReview />;
}
