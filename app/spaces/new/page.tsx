import { requireUser } from '@/lib/auth/require-user';
import { SpaceComposer } from '@/components/spaces/SpaceComposer';

export default async function NewSpacePage() {
  // Only the login-required gate - "ساخت draft آزاد" only means any logged
  // -in user, never anonymous; every real check (gate verdict, publish
  // rules) is enforced server-side by services/api, never trusted client-side.
  await requireUser();
  return <SpaceComposer />;
}
