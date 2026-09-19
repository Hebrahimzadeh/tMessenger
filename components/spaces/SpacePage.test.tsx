import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SpacePage } from './SpacePage';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  // Empty by default; the built-notice tests pass their own.
  useSearchParams: () => new URLSearchParams(searchParams),
}));

/** Reassigned per test to drive `useSearchParams`. */
let searchParams = '';

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
    followerCount: 4,
    isFollowing: true,
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
    // needs the plain-substring fallback below.
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

function card(id: string, title: string, body: string) {
  return {
    id,
    authorId: '55555555-5555-4555-8555-555555555555',
    kind: 'REUSABLE_RESOURCE',
    publishedAt: '2026-09-10T00:00:00.000Z',
    title,
    body,
    attachmentCount: 0,
  };
}
const EMPTY_PINS = { items: [], limit: 5 };

function mountSpace(overrides: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  mockFetchByUrl({
    [`/spaces/${SPACE_ID}`]: fullSpace(overrides),
    '/cards': EMPTY_CARDS_PAGE,
    '/pins': EMPTY_PINS,
    ...extra,
  });
  render(<SpacePage idOrSlug={SPACE_ID} />);
}

/** The information sheet is where everything that is not the conversation now lives. */
async function openInfo(user: ReturnType<typeof userEvent.setup>, name: 'مشخصات بستر' | 'مدیریت بستر' = 'مشخصات بستر') {
  // A regex, not the exact string: an unpublished space's heading also
  // carries its status badge, and that badge is part of the accessible name.
  await screen.findByRole('heading', { name: /باغ محله/ });
  await user.click(screen.getByRole('button', { name }));
}

describe('SpacePage: a space looks like a conversation', () => {
  afterEach(() => {
    searchParams = '';
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('shows a loading state, then the space in its toolbar', async () => {
    mountSpace();
    expect(screen.getByRole('status')).toHaveTextContent('در حال بارگذاری');
    expect(await screen.findByRole('heading', { name: 'باغ محله' })).toBeInTheDocument();
  });

  it('says how many people are in it, the way a chat header does', async () => {
    mountSpace();
    expect(await screen.findByText('۴ مشارکت‌کننده')).toBeInTheDocument();
  });

  it('offers exactly one search box, right under the toolbar', async () => {
    mountSpace();
    await screen.findByRole('heading', { name: 'باغ محله' });

    expect(screen.getByLabelText('جستجو در بستر')).toBeInTheDocument();
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
  });

  it('searches inside the space rather than across other spaces', async () => {
    mockFetchByUrl({
      [`/spaces/${SPACE_ID}`]: fullSpace(),
      '/cards': {
        items: [
          card('66666666-6666-4666-8666-666666666666', 'نردبان آلومینیومی', 'سه متری'),
          card('77777777-7777-4777-8777-777777777777', 'دریل شارژی', 'رونیکس'),
        ],
        nextCursor: null,
      },
      '/pins': EMPTY_PINS,
    });
    const user = userEvent.setup();
    render(<SpacePage idOrSlug={SPACE_ID} />);
    await screen.findByText('نردبان آلومینیومی');

    await user.type(screen.getByLabelText('جستجو در بستر'), 'دریل');

    expect(screen.getByText('دریل شارژی')).toBeInTheDocument();
    expect(screen.queryByText('نردبان آلومینیومی')).not.toBeInTheDocument();
  });

  it('says so plainly when a search inside the space finds nothing', async () => {
    mockFetchByUrl({
      [`/spaces/${SPACE_ID}`]: fullSpace(),
      '/cards': { items: [card('66666666-6666-4666-8666-666666666666', 'نردبان', 'سه متری')], nextCursor: null },
      '/pins': EMPTY_PINS,
    });
    const user = userEvent.setup();
    render(<SpacePage idOrSlug={SPACE_ID} />);
    await screen.findByText('نردبان');

    await user.type(screen.getByLabelText('جستجو در بستر'), 'چیزی که نیست');
    expect(await screen.findByText('کارتی با این عبارت پیدا نشد.')).toBeInTheDocument();
  });

  it('puts the card tool where a chat keeps its message box', async () => {
    mountSpace();
    await screen.findByRole('heading', { name: 'باغ محله' });
    expect(screen.getByRole('button', { name: 'ایجاد درخواست یا کارت جدید...' })).toBeInTheDocument();
  });

  it('asks a visitor who has not joined to join, instead of offering the card tool', async () => {
    mountSpace({ isFollowing: false });
    await screen.findByRole('heading', { name: 'باغ محله' });

    expect(screen.getByRole('button', { name: 'عضویت در این بستر' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ایجاد درخواست یا کارت جدید...' })).not.toBeInTheDocument();
  });

  it('lets them join, and then write', async () => {
    mockFetchByUrl({
      '/follow': { ok: true },
      [`/spaces/${SPACE_ID}`]: fullSpace({ isFollowing: false }),
      '/cards': EMPTY_CARDS_PAGE,
      '/pins': EMPTY_PINS,
    });
    const user = userEvent.setup();
    render(<SpacePage idOrSlug={SPACE_ID} />);
    await screen.findByRole('heading', { name: 'باغ محله' });

    await user.click(screen.getByRole('button', { name: 'عضویت در این بستر' }));

    expect(await screen.findByRole('button', { name: 'ایجاد درخواست یا کارت جدید...' })).toBeInTheDocument();
    // The count the toolbar shows is the one they just changed.
    expect(screen.getByText('۵ مشارکت‌کننده')).toBeInTheDocument();
  });

  it('shows a not-found message for an unknown or invisible space', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(404, { error: { code: 'SPACE_NOT_FOUND', message: 'این بستر یافت نشد.', correlationId: 'r', details: [] } })
    ) as unknown as typeof fetch;
    render(<SpacePage idOrSlug="unknown" />);
    expect(await screen.findByText('این بستر یافت نشد.')).toBeInTheDocument();
  });

  it('renders example cards from cardHints in the feed', async () => {
    mountSpace({
      definition: { ...fullSpace().definition, cardHints: [{ isExample: true, label: 'نمونه', title: 'کارت نمونه' }] },
    });
    expect(await screen.findByText('کارت نمونه')).toBeInTheDocument();
    expect(screen.getByText('نمونه — محتوای واقعی نیست')).toBeInTheDocument();
  });
});

describe('SpacePage: everything that is not the conversation, behind the toolbar', () => {
  afterEach(() => {
    searchParams = '';
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('keeps the page itself clear of roles, rules and settings', async () => {
    mountSpace();
    await screen.findByRole('heading', { name: 'باغ محله' });

    // The nine stacked sections this page used to be are the reason the owner
    // called it wrong; none of them may appear until the sheet is opened.
    expect(screen.queryByText('سازمان‌دهنده')).not.toBeInTheDocument();
    expect(screen.queryByText(/قواعد و مخاطب/)).not.toBeInTheDocument();
  });

  it('lists both primary roles in the sheet, letting a visitor join one without it being mandatory', async () => {
    mockFetchByUrl({
      '/join': { ok: true },
      [`/spaces/${SPACE_ID}`]: fullSpace(),
      '/cards': EMPTY_CARDS_PAGE,
      '/pins': EMPTY_PINS,
    });
    const user = userEvent.setup();
    render(<SpacePage idOrSlug={SPACE_ID} />);
    await openInfo(user);

    expect(screen.getByText('سازمان‌دهنده')).toBeInTheDocument();
    expect(screen.getByText('همکار')).toBeInTheDocument();
    // Nothing about reading the space or its roles requires picking one -
    // "انتخاب نقش برای بازدیدکننده اجباری نباشد" - proven by the join button
    // being an ordinary opt-in action, not something gating the rest.
    await user.click(screen.getAllByRole('button', { name: 'پیوستن به نقش' })[0]!);
    expect(await screen.findByRole('button', { name: 'خروج از نقش' })).toBeInTheDocument();
  });

  it('offers the management tab only to whoever runs the space', async () => {
    mountSpace({ canManage: true });
    expect(await screen.findByRole('button', { name: 'مدیریت بستر' })).toBeInTheDocument();
  });

  it('offers no management tab to a visitor', async () => {
    mountSpace({ canManage: false });
    await screen.findByRole('heading', { name: 'باغ محله' });
    expect(screen.queryByRole('button', { name: 'مدیریت بستر' })).not.toBeInTheDocument();
  });

  it('offers editing to the manager of a published space', async () => {
    mountSpace({ canManage: true });
    const user = userEvent.setup();
    await openInfo(user, 'مدیریت بستر');
    expect(await screen.findByRole('button', { name: 'ویرایش بستر' })).toBeInTheDocument();
  });

  it('does not offer editing of a space that is not published yet', async () => {
    mountSpace({ canManage: true, status: 'HUMAN_REVIEW' });
    const user = userEvent.setup();
    await openInfo(user, 'مدیریت بستر');

    expect(await screen.findByText(/هنوز منتشر نشده است/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ویرایش بستر' })).not.toBeInTheDocument();
  });

  it('creates and displays an invite link on demand', async () => {
    mockFetchByUrl({
      '/invites': { token: 'abc123token' },
      [`/spaces/${SPACE_ID}`]: fullSpace({ canManage: true }),
      '/cards': EMPTY_CARDS_PAGE,
      '/pins': EMPTY_PINS,
    });
    const user = userEvent.setup();
    render(<SpacePage idOrSlug={SPACE_ID} />);
    await openInfo(user, 'مدیریت بستر');

    await user.click(screen.getByRole('button', { name: /ساخت پیوند دعوت/ }));
    expect(await screen.findByText(/abc123token/)).toBeInTheDocument();
  });

  it('shows the health panel only on the management tab, never to a visitor', async () => {
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
      [`/spaces/${SPACE_ID}`]: fullSpace({ canManage: true }),
      '/cards': EMPTY_CARDS_PAGE,
      '/pins': EMPTY_PINS,
    });
    const user = userEvent.setup();
    const owner = render(<SpacePage idOrSlug={SPACE_ID} />);
    await openInfo(user, 'مدیریت بستر');
    expect(await screen.findByText('سلامت بستر')).toBeInTheDocument();
    owner.unmount();

    mountSpace({ canManage: false });
    await openInfo(user);
    expect(screen.queryByText('سلامت بستر')).not.toBeInTheDocument();
  });
});

describe('SpacePage: the notice after a space is built', () => {
  afterEach(() => {
    searchParams = '';
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function renderBuilt(query: string, canManage = true) {
    searchParams = query;
    mountSpace({ canManage });
  }

  it('welcomes a person to the space they just built', async () => {
    // Read from the router, not from window.location: on a client navigation
    // the address bar updates after the new route renders, so reading it
    // during render showed the previous URL and this never appeared.
    renderBuilt('built=published&ai=1');
    expect(await screen.findByText(/ساخته و منتشر شد/)).toBeInTheDocument();
    expect(screen.getByText(/شما مدیر این بستر هستید/)).toBeInTheDocument();
  });

  it('says plainly when rules built it rather than a model', async () => {
    renderBuilt('built=published&ai=0');
    expect(await screen.findByText(/بدون دستیار هوش مصنوعی/)).toBeInTheDocument();
  });

  it('explains a space that is waiting for a person, without calling it a refusal', async () => {
    renderBuilt('built=review&ai=1');
    expect(await screen.findByText(/پس از نگاه یک نفر منتشر می‌شود/)).toBeInTheDocument();
    expect(screen.getByText(/چیزی رد نشده است/)).toBeInTheDocument();
  });

  it('can be dismissed, because it is a greeting and not a state', async () => {
    renderBuilt('built=published&ai=1');
    const user = userEvent.setup();
    await screen.findByText(/ساخته و منتشر شد/);

    await user.click(screen.getByRole('button', { name: 'بستن پیام' }));
    expect(screen.queryByText(/ساخته و منتشر شد/)).not.toBeInTheDocument();
  });

  it('shows nothing on an ordinary visit', async () => {
    renderBuilt('');
    await screen.findByRole('heading', { name: 'باغ محله' });
    expect(screen.queryByText(/ساخته و منتشر شد/)).not.toBeInTheDocument();
  });
});
