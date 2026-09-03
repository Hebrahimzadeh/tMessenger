import { legalCurrentResponseSchema } from '@taavon/contracts';
import { apiFetch } from '@/lib/api/client';
import { LegalDocumentPage } from '@/components/legal/LegalDocumentPage';

export default async function TermsPage() {
  let version: number | null = null;
  try {
    const data = legalCurrentResponseSchema.parse(await apiFetch('/legal/current'));
    version = data.termsVersion;
  } catch {
    // Public page - a downstream API failure must not crash it, only show
    // the fallback notice (see LegalDocumentPage).
  }

  return <LegalDocumentPage title="قوانین و مقررات" version={version} />;
}
