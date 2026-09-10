import { requireUser } from '@/lib/auth/require-user';
import { AwarenessFunnel } from '@/components/metrics/AwarenessFunnel';

export default async function AdminMetricsPage() {
  // Only the login-required gate - SUPERADMIN + MFA are enforced
  // server-side by GET /v1/admin/metrics/awareness itself, never trusted
  // client-side (same division of responsibility as app/admin/page.tsx).
  await requireUser();
  return <AwarenessFunnel />;
}
