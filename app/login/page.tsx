import { sanitizeNextPath } from '@/lib/auth/redirect-allowlist';
import { LoginFlow } from '@/components/auth/LoginFlow';

interface LoginPageProps {
  searchParams: Promise<{ next?: string | string[] }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = sanitizeNextPath(params.next ?? null);
  return <LoginFlow next={next} />;
}
