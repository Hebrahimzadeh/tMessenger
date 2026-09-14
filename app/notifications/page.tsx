import { requireUser } from '@/lib/auth/require-user';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';

export default async function NotificationsPage() {
  await requireUser();
  return <NotificationCenter />;
}
