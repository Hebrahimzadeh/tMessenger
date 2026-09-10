import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SpacePage } from './SpacePage';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const originalFetch = global.fetch;
const SPACE_ID = '11111111-1111-4111-8111-111111111111';
const ROLE_ID = '22222222-2222-4222-8222-222222222222';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function fullSpace(overrides: Record<string, unknown> = {}) {
  return {
    id: SPACE_ID,
    slug: 'baagh-mahalle',
    status: 'PUBLISHED',
    creatorId: '33333333-3333-4333-8333-333333333333',
    publishedAt: '2026-09-06T00:00:00.000Z',
    archivedAt: null,
    definition: {
      versionNumber: 2,
      title: 'باغ محله',
      purpose: 'نگهداری مشترک باغچه محله',
      audience: null,
      participationMethods: ['حضوری'],
      cardHints: null,
      policyVersion: 1,
      roles: [
        { id: ROLE_ID, key: 'organizer', title: 'سازمان‌دهنده', description: null, isPrimary: true },
        { id: '44444444-4444-4444-8444-444444444444', key: 'contributor', title: 'همکار', description: null, isPrimary: true },
      ],
    },
    canManage: false,
    ...overrides,
  };
}

function mockFetchByUrl(handlers: Record<string, unknown>) {
  const entries = Object.entries(handlers);
  global.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    // An exact suffix match wins first - `/spaces/:id` would otherwise also
    // match `/spaces/:id/cards`, `/spaces/:id/pins`, `/spaces/:id/invites`
    // etc. as a mere substring; only a pattern with a trailing query string
    // (like `/spaces?q=`) needs the plain-substring fallback below.
    for (const [path, body] of entries) {
      if (url.endsWith(path)) return Promise.resolve(jsonResponse(200, body));
    }
    for (const [path, body] of entries) {
      if (url.includes(path)) return Promise.resolve(jsonResponse(200, body));
    }
    return Promise.resolve(jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'x', correlationId: 'r', details: [] } }));
  }) as unknown as typeof fetch;
}

const EMPTY_CARDS_PAGE = { items: [], nextCursor: null };
const EMPTY_PINS = { items: [], limit: 5 };

describe('SpacePage', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('shows a loading state, then the header once loaded', async () => {
    mockFetchByUrl({ [`/spaces/${SPACE_ID}`]: fullSpace() });
    render(<SpacePage idOrSlug={SPACE_ID} />);

    expect(screen.getByRole('status')).toHaveTextContent('در حال بارگذاری');
    expect(await screen.findByRole('heading', { name: 'باغ محله' })).toBeInTheDocument();
  });

  it('shows a not-found message for an unknown or invisible space', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(404, { error: { code: 'SPACE_NOT_FOUND', message: 'این بستر یافت نشد.', correlationId: 'r', details: [] } })
    ) as unknown as typeof fetch;
    render(<SpacePage idOrSlug="unknown" />);
    expect(await screen.findByText('این بستر یافت نشد.')).toBeInTheDocument();
  });

  it('lists both primary roles, letting a visitor join one without it being mandatory', async () => {
    mockFetchByUrl({ '/join': { ok: true }, [`/spaces/${SPACE_ID}`]: fullSpace() });
    const user = userEvent.setup();
    render(<SpacePage idOrSlug={SPACE_ID} />);

    await screen.findByText('سازمان‌دهنده');
    expect(screen.getByText('همکار')).toBeInTheDocument();
    // Nothing about viewing the page or its roles requires picking one -
    // "انتخاب نقش برای بازدیدکننده اجباری نباشد" - proven by the join
    // button being an ordinary opt-in action, not something gating the
    // rest of the page.
    const joinButtons = screen.getAllByRole('button', { name: 'پیوستن به نقش' });
    await user.click(joinButtons[0]!);
    expect(await screen.findByRole('button', { name: 'خروج از نقش' })).toBeInTheDocument();
  });

  it('shows an invite-link generator only for the owner/admin view (gate field present)', async () => {
    mockFetchByUrl({ [`/spaces/${SPACE_ID}`]: fullSpace({ canManage: true, gate: { verdict: 'ALLOW', reason: 'x' } }) });
    render(<SpacePage idOrSlug={SPACE_ID} />);
    await screen.findByText('سازمان‌دهنده');
    expect(screen.getByRole('button', { name: 'ساخت پیوند دعوت' })).toBeInTheDocument();
  });

  it('does not show the invite-link generator for a public, non-owner view', async () => {
    mockFetchByUrl({ [`/spaces/${SPACE_ID}`]: fullSpace() });
    render(<SpacePage idOrSlug={SPACE_ID} />);
    await screen.findByText('سازمان‌دهنده');
    expect(screen.queryByRole('button', { name: 'ساخت پیوند دعوت' })).not.toBeInTheDocument();
  });

  it('shows the health panel only for the owner/admin view, never for a public visitor', async () => {
    mockFetchByUrl({
      '/health': {
        status: 'ACTIVE',
        cardCount: 0,
        contributorCount: 2,
        meaningfulViewCount: 0,
        firstUseLatencySeconds: null,
        roleActivity: { totalRoleCount: 2, activeRoleCount: 2 },
        crossRoleCardRate: 0,
        appliedRate: 0,
        reservationClosedRate: 0,
        reportQuality: null,
        lastActivityAt: null,
        suggestions: [],
        computedAt: '2026-09-09T00:00:00.000Z',
      },
      [`/spaces/${SPACE_ID}`]: fullSpace({ canManage: true, gate: { verdict: 'ALLOW', reason: 'x' } }),
    });
    const owner = render(<SpacePage idOrSlug={SPACE_ID} />);
    await owner.findByText('سلامت بستر');
    owner.unmount();

    mockFetchByUrl({ [`/spaces/${SPACE_ID}`]: fullSpace() });
    render(<SpacePage idOrSlug={SPACE_ID} />);
    await screen.findByText('سازمان‌دهنده');
    expect(screen.queryByText('سلامت بستر')).not.toBeInTheDocument();
  });

  it('creates and displays an invite link on demand', async () => {
    mockFetchByUrl({
      '/invites': { token: 'abc123token' },
      [`/spaces/${SPACE_ID}`]: fullSpace({ canManage: true, gate: { verdict: 'ALLOW', reason: 'x' } }),
    });
    const user = userEvent.setup();
    render(<SpacePage idOrSlug={SPACE_ID} />);
    await screen.findByText('سازمان‌دهنده');

    await user.click(screen.getByRole('button', { name: 'ساخت پیوند دعوت' }));
    expect(await screen.findByText(/abc123token/)).toBeInTheDocument();
  });

  it('shows a real empty state for pins and tools, and a real create-card trigger', async () => {
    mockFetchByUrl({
      [`/spaces/${SPACE_ID}`]: fullSpace(),
      [`/spaces/${SPACE_ID}/cards`]: EMPTY_CARDS_PAGE,
      [`/spaces/${SPACE_ID}/pins`]: EMPTY_PINS,
    });
    render(<SpacePage idOrSlug={SPACE_ID} />);
    await screen.findByText('سازمان‌دهنده');

    expect(screen.getByText(/ابزاری برای این بستر هنوز/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ثبت کارت جدید' })).toBeInTheDocument();
  });

  it('renders example cards from cardHints in the feed section', async () => {
    mockFetchByUrl({
      [`/spaces/${SPACE_ID}`]: fullSpace({
        definition: { ...fullSpace().definition, cardHints: [{ isExample: true, label: 'نمونه', title: 'کارت نمونه' }] },
      }),
      [`/spaces/${SPACE_ID}/cards`]: EMPTY_CARDS_PAGE,
      [`/spaces/${SPACE_ID}/pins`]: EMPTY_PINS,
    });
    render(<SpacePage idOrSlug={SPACE_ID} />);
    expect(await screen.findByText('کارت نمونه')).toBeInTheDocument();
    expect(screen.getByText('نمونه — محتوای واقعی نیست')).toBeInTheDocument();
  });

  it('searches other spaces from within the page', async () => {
    mockFetchByUrl({
      [`/spaces/${SPACE_ID}`]: fullSpace(),
      '/spaces?q=': {
        items: [{ id: '55555555-5555-4555-8555-555555555555', slug: 'other-space', title: 'بستر دیگر', purpose: 'x', followerCount: 0, publishedAt: '2026-09-01T00:00:00.000Z' }],
        nextCursor: null,
      },
    });
    const user = userEvent.setup();
    render(<SpacePage idOrSlug={SPACE_ID} />);
    await screen.findByText('سازمان‌دهنده');

    await user.type(screen.getByLabelText('جست‌وجوی بسترها'), 'دیگر');
    await user.click(screen.getByRole('button', { name: 'جست‌وجو' }));

    expect(await screen.findByText('بستر دیگر')).toBeInTheDocument();
  });
});
