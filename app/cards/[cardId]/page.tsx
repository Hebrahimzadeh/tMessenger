import { CardDetailView } from '@/components/spaces/CardDetailView';

interface CardRoutePageProps {
  params: Promise<{ cardId: string }>;
}

// Same client-fetched tradeoff as app/spaces/[slug]/page.tsx: only the
// browser's own apiFetch call carries the session cookie, so a Server
// Component fetch here could never show the owner-only reservation
// actions or the caller's own comment/reaction state.
export default async function CardRoutePage({ params }: CardRoutePageProps) {
  const { cardId } = await params;
  return <CardDetailView cardId={cardId} />;
}
