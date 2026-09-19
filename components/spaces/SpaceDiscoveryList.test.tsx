import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SpaceDiscoveryList } from './SpaceDiscoveryList';

const originalFetch = global.fetch;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const PUBLIC_SPACE = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'baagh-mahalle',
  title: 'باغ محله',
  purpose: 'نگهداری مشترک باغچه',
  followerCount: 2,
  publishedAt: '2026-09-01T00:00:00.000Z',
};

const MY_DRAFT = {
  id: '22222222-2222-4222-8222-222222222222',
  slug: 'amanat-abzar',
  title: 'امانت ابزار',
  purpose: 'امانت دادن وسایل به همسایه‌ها',
  status: 'HUMAN_REVIEW',
  createdAt: '2026-09-18T00:00:00.000Z',
};

/** Routes by URL: the list makes two calls, and which one answers first is not fixed. */
function mockFetch({ discovered = [PUBLIC_SPACE], mine = [] as unknown[], mineStatus = 200 } = {}) {
  global.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/spaces/mine')) {
      return Promise.resolve(
        mineStatus === 200
          ? jsonResponse(200, { items: mine })
          : jsonResponse(mineStatus, { error: { code: 'UNAUTHENTICATED', message: 'وارد شوید.', correlationId: 'r', details: [] } })
      );
    }
    return Promise.resolve(jsonResponse(200, { items: discovered, nextCursor: null }));
  }) as unknown as typeof fetch;
}

describe('SpaceDiscoveryList: the chat list of this messenger', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('shows a loading state, then the list', async () => {
    mockFetch();
    render(<SpaceDiscoveryList />);
    expect(screen.getByRole('status')).toHaveTextContent('در حال بارگذاری');
    expect(await screen.findByText('باغ محله')).toBeInTheDocument();
  });

  it('shows the person their own space even before it is published', async () => {
    // The whole reason /spaces/mine exists: the search index is PUBLISHED-only
    // by design, so a space still waiting for a person appeared in no list at
    // all and was reachable only by whoever still had the link.
    mockFetch({ mine: [MY_DRAFT] });
    render(<SpaceDiscoveryList />);

    expect(await screen.findByText('امانت ابزار')).toBeInTheDocument();
    expect(screen.getByText('در انتظار بررسی')).toBeInTheDocument();
  });

  it('lists their own spaces first, and never twice', async () => {
    const mineAndPublic = { ...MY_DRAFT, id: PUBLIC_SPACE.id, slug: PUBLIC_SPACE.slug, title: 'باغ محله', status: 'PUBLISHED' };
    mockFetch({ mine: [mineAndPublic] });
    render(<SpaceDiscoveryList />);

    await screen.findByText('باغ محله');
    expect(screen.getAllByText('باغ محله')).toHaveLength(1);
  });

  it('still shows the public list when the caller has no session', async () => {
    mockFetch({ mineStatus: 401 });
    render(<SpaceDiscoveryList />);
    expect(await screen.findByText('باغ محله')).toBeInTheDocument();
  });

  it('shows a real empty state, with the way out of it', async () => {
    mockFetch({ discovered: [] });
    render(<SpaceDiscoveryList />);

    expect(await screen.findByText(/هنوز بستری/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ساخت بستر/ })).toHaveAttribute('href', '/spaces/new');
  });

  it('shows a retry option on failure, which re-fetches successfully', async () => {
    let failed = false;
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/spaces/mine')) return Promise.resolve(jsonResponse(200, { items: [] }));
      if (!failed) {
        failed = true;
        return Promise.resolve(jsonResponse(500, { error: { code: 'INTERNAL', message: 'خطا', correlationId: 'r', details: [] } }));
      }
      return Promise.resolve(jsonResponse(200, { items: [], nextCursor: null }));
    }) as unknown as typeof fetch;
    const user = userEvent.setup();

    render(<SpaceDiscoveryList />);
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'تلاش دوباره' }));

    expect(await screen.findByText(/هنوز بستری/)).toBeInTheDocument();
  });

  it('makes every row a link into its own space, the way a chat row is', async () => {
    mockFetch();
    render(<SpaceDiscoveryList />);
    expect(await screen.findByRole('link', { name: /باغ محله/ })).toHaveAttribute('href', '/spaces/baagh-mahalle');
  });
});
