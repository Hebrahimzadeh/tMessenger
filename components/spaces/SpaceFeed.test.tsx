import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SpaceFeed } from './SpaceFeed';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const originalFetch = global.fetch;
const SPACE_ID = '11111111-1111-4111-8111-111111111111';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const CARD = {
  id: '22222222-2222-4222-8222-222222222222',
  authorId: '33333333-3333-4333-8333-333333333333',
  kind: 'AWARENESS',
  publishedAt: '2026-09-10T00:00:00.000Z',
  body: 'کمک به آبیاری آخر هفته',
  attachmentCount: 0,
  imageUrl: null,
  engagement: { likeCount: 2, commentCount: 1, likedByMe: false, bookmarkedByMe: false },
};

/** Both calls the feed makes: the card page, and `/me` for who is reading it. */
function respond(cards: unknown[]) {
  return vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/me')) return Promise.resolve(jsonResponse(401, {}));
    return Promise.resolve(jsonResponse(200, { items: cards, nextCursor: null }));
  }) as unknown as typeof fetch;
}

describe('SpaceFeed', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('shows a real empty state when the space has no cards', async () => {
    global.fetch = respond([]);
    render(<SpaceFeed spaceId={SPACE_ID} />);
    await waitFor(() => expect(screen.getByText(/هنوز کارتی/)).toBeInTheDocument());
  });

  it('renders the space\'s cards from the API', async () => {
    global.fetch = respond([CARD]);
    render(<SpaceFeed spaceId={SPACE_ID} />);
    await waitFor(() => expect(screen.getByText('کمک به آبیاری آخر هفته')).toBeInTheDocument());
  });

  it('has no second, sample-card kind of row any more', async () => {
    global.fetch = respond([CARD]);
    render(<SpaceFeed spaceId={SPACE_ID} />);
    await waitFor(() => expect(screen.getByText('کمک به آبیاری آخر هفته')).toBeInTheDocument());
    // The labelled "نمونه — محتوای واقعی نیست" row is gone: a space opens
    // with three real cards instead (owner, 2026-09-27).
    expect(screen.queryByText(/محتوای واقعی نیست/)).not.toBeInTheDocument();
  });
});
