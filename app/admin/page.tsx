import { requireUser } from '@/lib/auth/require-user';
import { AdminDashboard } from '@/components/admin/AdminDashboard';

export default async function AdminPage() {
  // Only the login-required gate - role and MFA are enforced server-side by
  // every /v1/admin/* call AdminDashboard makes (services/api's
  // requireRole), never trusted client-side.
  await requireUser();
  return <AdminDashboard />;
}
