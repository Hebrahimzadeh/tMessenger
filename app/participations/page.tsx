import { requireUser } from '@/lib/auth/require-user';
import { ParticipationTimeline } from '@/components/participations/ParticipationTimeline';

export default async function ParticipationsPage() {
  await requireUser();
  return <ParticipationTimeline />;
}
