import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SpaceFeed } from './SpaceFeed';

const originalFetch = global.fetch;
const SPACE_ID = '11111111-1111-4111-8111-111111111111';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('SpaceFeed', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('shows a real empty state when there are no cards and no example hints yet', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { items: [], nextCursor: null })) as unknown as typeof fetch;
    render(<SpaceFeed spaceId={SPACE_ID} cardHints={null} />);
    await waitFor(() => expect(screen.getByText(/هنوز کارتی/)).toBeInTheDocument());
  });

  it('renders real cards from the API', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        items: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            authorId: '33333333-3333-4333-8333-333333333333',
            kind: 'AWARENESS',
            publishedAt: '2026-09-10T00:00:00.000Z',
            title: 'کمک به آبیاری آخر هفته',
            body: 'یک کارت واقعی',
            attachmentCount: 0,
          },
        ],
        nextCursor: null,
      })
    ) as unknown as typeof fetch;

    render(<SpaceFeed spaceId={SPACE_ID} cardHints={null} />);
    await waitFor(() => expect(screen.getByText('کمک به آبیاری آخر هفته')).toBeInTheDocument());
  });

  it('renders each example card hint with the fixed "not real content" badge, permanently and inert', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { items: [], nextCursor: null })) as unknown as typeof fetch;
    render(
      <SpaceFeed
        spaceId={SPACE_ID}
        cardHints={[{ isExample: true, label: 'نمونه', title: 'کمک به آبیاری آخر هفته', description: 'یک کارت نمونه' }]}
      />
    );
    await waitFor(() => expect(screen.getByText('کمک به آبیاری آخر هفته')).toBeInTheDocument());
    expect(screen.getByText(/نمونه — محتوای واقعی نیست/)).toBeInTheDocument();
    // No link/button anywhere in an example card - fully inert, no navigation possible.
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
