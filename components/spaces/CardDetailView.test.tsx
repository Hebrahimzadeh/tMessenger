import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CardDetailView } from './CardDetailView';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const originalFetch = global.fetch;
const CARD_ID = '11111111-1111-4111-8111-111111111111';
const AUTHOR_ID = '22222222-2222-4222-8222-222222222222';
const VIEWER_ID = '33333333-3333-4333-8333-333333333333';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function cardResponse() {
  return {
    id: CARD_ID,
    spaceId: '44444444-4444-4444-8444-444444444444',
    authorId: AUTHOR_ID,
    kind: 'AWARENESS',
    status: 'ACTIVE',
    publishedAt: '2026-09-10T00:00:00.000Z',
    revision: { revisionNumber: 1, title: 'یک کارت', body: 'متن کارت' },
    inferredKind: 'AWARENESS',
    attachments: [],
  };
}

function meResponse(userId: string) {
  return { userId, hasProfile: true, username: 'x', displayName: 'x', bio: null, phoneVisibility: 'PRIVATE' };
}

function mockFetchRouter(handlers: Record<string, unknown>) {
  const viewCalls: string[] = [];
  const fetchFn = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method === 'POST' && url.pathname.endsWith('/views')) {
      viewCalls.push(url.pathname);
      return jsonResponse(200, { recorded: true });
    }
    for (const [suffix, body] of Object.entries(handlers)) {
      if (url.pathname.endsWith(suffix)) return jsonResponse(200, body);
    }
    return jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'x', correlationId: 'x' } });
  });
  return { fetchFn, viewCalls };
}

describe('CardDetailView: MEANINGFUL_VIEW tracking', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('records a view once for a logged-in, non-author viewer', async () => {
    const { fetchFn, viewCalls } = mockFetchRouter({
      [`/cards/${CARD_ID}`]: cardResponse(),
      '/me': meResponse(VIEWER_ID),
      [`/spaces/44444444-4444-4444-8444-444444444444`]: { canManage: false },
      '/comments': { items: [], nextCursor: null },
      '/reactions': { counts: { SUPPORT: 0, USEFUL: 0, INTERESTED: 0, CELEBRATE: 0 }, mine: [] },
      '/reservation': { cardId: CARD_ID, state: 'ACTIVE', reservationId: null, reserverId: null, closeReason: null },
    });
    global.fetch = fetchFn as unknown as typeof fetch;

    render(<CardDetailView cardId={CARD_ID} />);
    await waitFor(() => expect(viewCalls).toHaveLength(1));
    expect(viewCalls[0]).toBe(`/v1/cards/${CARD_ID}/views`);
  });

  it('does not record a view for an anonymous visitor (no session to attribute it to)', async () => {
    const viewCalls: string[] = [];
    global.fetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.pathname.endsWith('/me')) return jsonResponse(401, { error: { code: 'SESSION_INVALID', message: 'x', correlationId: 'x' } });
      if (url.pathname.endsWith(`/cards/${CARD_ID}`)) return jsonResponse(200, cardResponse());
      if (method === 'POST' && url.pathname.endsWith('/views')) {
        viewCalls.push(url.pathname);
        return jsonResponse(200, { recorded: true });
      }
      if (url.pathname.endsWith('/comments')) return jsonResponse(200, { items: [], nextCursor: null });
      if (url.pathname.endsWith('/reactions')) return jsonResponse(200, { counts: { SUPPORT: 0, USEFUL: 0, INTERESTED: 0, CELEBRATE: 0 }, mine: [] });
      if (url.pathname.endsWith('/reservation')) {
        return jsonResponse(200, { cardId: CARD_ID, state: 'ACTIVE', reservationId: null, reserverId: null, closeReason: null });
      }
      return jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'x', correlationId: 'x' } });
    }) as unknown as typeof fetch;

    render(<CardDetailView cardId={CARD_ID} />);
    await screen.findByText('یک کارت');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(viewCalls).toHaveLength(0);
  });
});
