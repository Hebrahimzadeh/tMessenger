import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SpaceDiscoveryList } from './SpaceDiscoveryList';

const originalFetch = global.fetch;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('SpaceDiscoveryList', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('shows a loading state, then the list', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        items: [
          { id: '11111111-1111-4111-8111-111111111111', slug: 'baagh-mahalle', title: 'باغ محله', purpose: 'x', followerCount: 2, publishedAt: '2026-09-01T00:00:00.000Z' },
        ],
        nextCursor: null,
      })
    ) as unknown as typeof fetch;

    render(<SpaceDiscoveryList />);
    expect(screen.getByRole('status')).toHaveTextContent('در حال بارگذاری');
    expect(await screen.findByText('باغ محله')).toBeInTheDocument();
  });

  it('shows a real empty state when there are no published spaces yet', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { items: [], nextCursor: null })) as unknown as typeof fetch;
    render(<SpaceDiscoveryList />);
    expect(await screen.findByText(/هنوز بستری/)).toBeInTheDocument();
  });

  it('shows a retry option on failure, which re-fetches successfully', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(500, { error: { code: 'INTERNAL', message: 'خطا', correlationId: 'r', details: [] } })
      )
      .mockResolvedValueOnce(jsonResponse(200, { items: [], nextCursor: null }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const user = userEvent.setup();

    render(<SpaceDiscoveryList />);
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'تلاش دوباره' }));

    expect(await screen.findByText(/هنوز بستری/)).toBeInTheDocument();
  });

  it('links each item to its own space page', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        items: [
          { id: '11111111-1111-4111-8111-111111111111', slug: 'baagh-mahalle', title: 'باغ محله', purpose: 'x', followerCount: 0, publishedAt: '2026-09-01T00:00:00.000Z' },
        ],
        nextCursor: null,
      })
    ) as unknown as typeof fetch;

    render(<SpaceDiscoveryList />);
    expect(await screen.findByRole('link', { name: /باغ محله/ })).toHaveAttribute('href', '/spaces/baagh-mahalle');
  });
});
