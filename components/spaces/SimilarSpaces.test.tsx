import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SimilarSpaces } from './SimilarSpaces';

const originalFetch = global.fetch;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('SimilarSpaces', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders nothing while loading and nothing when there are no matches', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { items: [] })) as unknown as typeof fetch;
    render(<SimilarSpaces title="باغ محله" purpose="نگهداری مشترک" />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByText(/مشابه/)).not.toBeInTheDocument();
  });

  it('shows each match with both CTAs, and never blocks continuing independently', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        items: [{ id: '11111111-1111-4111-8111-111111111111', slug: 'baagh-mahalle', title: 'باغ محله', overlapScore: 0.5 }],
      })
    ) as unknown as typeof fetch;

    render(<SimilarSpaces title="باغچه محله ما" purpose="نگهداری باغچه" />);

    expect(await screen.findByText('باغ محله')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /مشارکت در بستر موجود/ })).toHaveAttribute('href', '/spaces/baagh-mahalle');
    // The "continue independently" choice is never a link/button this
    // component disables or hides - it belongs to the composer's own flow,
    // not something a similarity match can block.
    expect(screen.queryByRole('button', { name: /ادامهٔ ساخت مستقل/ })).not.toBeInTheDocument();
  });

  it('does not query with an empty title (nothing meaningful to compare yet)', () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { items: [] }));
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<SimilarSpaces title="" purpose="" />);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
