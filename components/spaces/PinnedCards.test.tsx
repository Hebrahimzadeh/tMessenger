import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PinnedCards } from './PinnedCards';

const originalFetch = global.fetch;
const SPACE_ID = '11111111-1111-4111-8111-111111111111';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('PinnedCards', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders nothing when there are no pins', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { items: [], limit: 5 })) as unknown as typeof fetch;
    const { container } = render(<PinnedCards spaceId={SPACE_ID} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('lists pinned cards in position order, each linking to its card', async () => {
    const CARD_2 = '22222222-2222-4222-8222-222222222222';
    const CARD_1 = '11111111-1111-4111-8111-111111111112';
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        items: [
          { cardId: CARD_2, position: 0, title: 'کارت دوم', pinnedAt: '2026-09-01T00:00:00.000Z' },
          { cardId: CARD_1, position: 1, title: 'کارت اول', pinnedAt: '2026-09-02T00:00:00.000Z' },
        ],
        limit: 5,
      })
    ) as unknown as typeof fetch;

    render(<PinnedCards spaceId={SPACE_ID} />);

    await waitFor(() => expect(screen.getByText(/کارت دوم/)).toBeInTheDocument());
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAttribute('href', `/cards/${CARD_2}`);
    expect(links[1]).toHaveAttribute('href', `/cards/${CARD_1}`);
  });
});
