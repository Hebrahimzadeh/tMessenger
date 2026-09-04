import { requireUser } from '@/lib/auth/require-user';
import { MfaSetup } from '@/components/mfa/MfaSetup';

export default async function SecuritySettingsPage() {
  await requireUser();
  return <MfaSetup />;
}
