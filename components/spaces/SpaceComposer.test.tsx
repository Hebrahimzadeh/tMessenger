import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SpaceComposer } from './SpaceComposer';

const originalFetch = global.fetch;
const SPACE_ID = '11111111-1111-4111-8111-111111111111';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function baseSpaceResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: SPACE_ID,
    slug: 'baagh-mahalle',
    status: 'DRAFT',
    creatorId: '22222222-2222-4222-8222-222222222222',
    publishedAt: null,
    archivedAt: null,
    definition: {
      versionNumber: 1,
      title: 'باغ محله',
      purpose: '',
      audience: null,
      participationMethods: [],
      cardHints: null,
      policyVersion: 1,
      roles: [],
    },
    canManage: true,
    gate: { verdict: null, reason: null },
    ...overrides,
  };
}

/**
 * A URL-dispatching fetch mock, not a positional mockResolvedValueOnce
 * chain: SimilarSpaces debounces its own request by 400ms, so it can
 * resolve before *or* after the composer's own PATCH/precheck calls
 * depending on real wall-clock timing during the test - a chain keyed on
 * call order would be flaky by construction.
 */
function mockFetchByUrl(handlers: Record<string, unknown>) {
  global.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    for (const [path, body] of Object.entries(handlers)) {
      if (url.includes(path)) return Promise.resolve(jsonResponse(200, body));
    }
    return Promise.resolve(jsonResponse(200, { items: [] })); // default: similarity, empty
  }) as unknown as typeof fetch;
}

async function fillDescribeStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('عنوان بستر'), 'باغ محله');
  await user.type(screen.getByLabelText('این بستر برای چیست؟'), 'نگهداری مشترک باغچه محله توسط داوطلبان');
}

describe('SpaceComposer: describe step', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('shows a Persian validation error for an empty title, without calling the API', async () => {
    global.fetch = vi.fn() as unknown as typeof fetch;
    const user = userEvent.setup();
    render(<SpaceComposer />);

    await user.click(screen.getByRole('button', { name: 'ادامه' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('عنوان بستر را وارد کنید.');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('creates the draft and moves to the roles step on continue', async () => {
    mockFetchByUrl({ '/spaces': baseSpaceResponse() });
    const user = userEvent.setup();
    render(<SpaceComposer />);

    await fillDescribeStep(user);
    await user.click(screen.getByRole('button', { name: 'ادامه' }));

    expect(await screen.findByLabelText('نقش اصلی اول')).toBeInTheDocument();
  });
});

describe('SpaceComposer: roles step', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  async function getToRolesStep(user: ReturnType<typeof userEvent.setup>) {
    mockFetchByUrl({ '/spaces': baseSpaceResponse() });
    render(<SpaceComposer />);
    await fillDescribeStep(user);
    await user.click(screen.getByRole('button', { name: 'ادامه' }));
    await screen.findByLabelText('نقش اصلی اول');
  }

  it('prefills two starting role suggestions the user can edit', async () => {
    const user = userEvent.setup();
    await getToRolesStep(user);

    expect(screen.getByLabelText('نقش اصلی اول')).toHaveValue('سازمان‌دهنده');
    expect(screen.getByLabelText('نقش اصلی دوم')).toHaveValue('همکار');
  });

  it('saves the definition, runs precheck, and shows an ALLOW verdict with a publish button', async () => {
    const user = userEvent.setup();
    await getToRolesStep(user);

    mockFetchByUrl({
      '/precheck': { verdict: 'ALLOW', reason: 'بستر با معیارهای پایه مطابقت دارد.', status: 'DRAFT' },
      [`/spaces/${SPACE_ID}`]: baseSpaceResponse(),
    });

    await user.click(screen.getByRole('button', { name: 'ادامه' }));

    expect(await screen.findByRole('button', { name: 'انتشار' })).toBeInTheDocument();
  });

  it('shows a validation error when a primary role is cleared', async () => {
    const user = userEvent.setup();
    await getToRolesStep(user);

    await user.clear(screen.getByLabelText('نقش اصلی دوم'));
    await user.click(screen.getByRole('button', { name: 'ادامه' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('هر دو نقش اصلی را وارد کنید.');
  });
});

describe('SpaceComposer: review step (the four precheck outcomes)', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  async function getToReviewStep(user: ReturnType<typeof userEvent.setup>, verdict: string, reason: string) {
    const status = verdict === 'HUMAN_REVIEW' ? 'HUMAN_REVIEW' : verdict === 'ALLOW' ? 'DRAFT' : 'PRECHECK_REQUIRED';
    mockFetchByUrl({
      '/precheck': { verdict, reason, status },
      [`/spaces/${SPACE_ID}`]: baseSpaceResponse(),
      '/spaces': baseSpaceResponse(),
    });
    render(<SpaceComposer />);
    await fillDescribeStep(user);
    await user.click(screen.getByRole('button', { name: 'ادامه' }));
    await screen.findByLabelText('نقش اصلی اول');
    await user.click(screen.getByRole('button', { name: 'ادامه' }));
  }

  it('ALLOW: publish button works and shows the published state with a link', async () => {
    const user = userEvent.setup();
    await getToReviewStep(user, 'ALLOW', 'بستر با معیارهای پایه مطابقت دارد.');
    await screen.findByRole('button', { name: 'انتشار' });

    mockFetchByUrl({ '/publish': { status: 'PUBLISHED', publishedAt: '2026-09-06T00:00:00.000Z' } });
    await user.click(screen.getByRole('button', { name: 'انتشار' }));

    expect(await screen.findByText(/منتشر شد/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /مشاهدهٔ بستر/ })).toHaveAttribute('href', '/spaces/baagh-mahalle');
  });

  it('REVISE: shows the specific reason and an editable path back, no publish button', async () => {
    const user = userEvent.setup();
    await getToReviewStep(user, 'REVISE', 'توضیح هدف را کامل‌تر بنویسید (حداقل ۲۰ نویسه).');

    expect(await screen.findByText('توضیح هدف را کامل‌تر بنویسید (حداقل ۲۰ نویسه).')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'انتشار' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ویرایش/ })).toBeInTheDocument();
  });

  it('HUMAN_REVIEW: shows an understandable pause message, no publish button', async () => {
    const user = userEvent.setup();
    await getToReviewStep(user, 'HUMAN_REVIEW', 'این محتوا نیاز به بررسی دستی دارد.');

    expect(await screen.findByText(/بررسی دستی/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'انتشار' })).not.toBeInTheDocument();
  });

  it('BLOCK: shows the reason and explicitly states no public page will be created, no publish button', async () => {
    const user = userEvent.setup();
    await getToReviewStep(user, 'BLOCK', 'محتوای این بستر با قوانین پلتفرم مغایرت دارد.');

    expect(await screen.findByText('محتوای این بستر با قوانین پلتفرم مغایرت دارد.')).toBeInTheDocument();
    expect(screen.getByText(/منتشر نخواهد شد/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'انتشار' })).not.toBeInTheDocument();
  });
});
