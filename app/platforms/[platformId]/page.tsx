import { redirect } from 'next/navigation';

// "URL قدیمی /platforms/:id را سازگار redirect کن تا prototype نشکند" - the
// old prototype's platform ids are local mock numbers with no real backend
// record (Task 12 replaces the home tab's mock PlatformsList with the real,
// API-backed space list), so there is no per-id mapping to preserve - a
// visit to any old link just returns home rather than 404ing.
export default function LegacyPlatformRedirect() {
  redirect('/');
}
