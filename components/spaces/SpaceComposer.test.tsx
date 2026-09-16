import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SpaceComposer } from './SpaceComposer';

const originalFetch = global.fetch;
const SPACE_ID = '11111111-1111-4111-8111-111111111111';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** The guidance the precheck now returns alongside its verdict. */
function guidanceFor(decision: string, overrides: Record<string, unknown> = {}) {
  return {
    title: 'باغ محله',
    purpose: 'نگهداری مشترک باغچه محله توسط داوطلبان',
    assumptions: ['فرض شد مشارکت داوطلبانه است.'],
    strengths: ['از یک نیاز واقعی شروع شده است.'],
    risks: ['هنوز روشن نیست چه کسی هماهنگی را بر عهده می‌گیرد.'],
    questions: ['چه کسی اولین قدم را برمی‌دارد؟'],
    suggestedRevisions:
      decision === 'REVISE'
        ? [{ field: 'purpose', value: 'متن کامل‌تر برای هدف', reason: 'توضیح هدف را کامل‌تر بنویسید.' }]
        : [],
    participationRoles: [
      { title: 'هماهنگ‌کننده', description: 'کارها را تقسیم می‌کند.', isPrimary: true },
      { title: 'مشارکت‌کننده', description: 'در انجام کار سهم می‌گیرد.', isPrimary: true },
    ],
    valueChainNodes: ['شناسایی نیاز'],
    exampleCardTemplates: [
      { title: 'نمونه: اعلام آمادگی', body: 'من می‌توانم کمک کنم.', isExample: true, notice: 'نمونه — محتوای واقعی نیست' },
    ],
    suggestedToolKeys: ['coordination'],
    creationDecision: decision,
    matchedPolicyRules: decision === 'BLOCK' ? ['gambling@v1 — قانون مجازات اسلامی'] : [],
    safetyLevel: decision === 'BLOCK' ? 'SEVERE' : decision === 'HUMAN_REVIEW' ? 'REVIEW' : 'NORMAL',
    policyVersionRef: 'baseline:v1:8rules',
    ...overrides,
  };
}

function precheckResponse(verdict: string, reason: string, withGuidance = true) {
  const status = verdict === 'HUMAN_REVIEW' ? 'HUMAN_REVIEW' : verdict === 'ALLOW' ? 'DRAFT' : 'PRECHECK_REQUIRED';
  return {
    verdict,
    reason,
    status,
    policyVersionRef: withGuidance ? 'baseline:v1:8rules' : 'unavailable',
    matchedPolicyRules: verdict === 'BLOCK' ? ['gambling@v1 — قانون مجازات اسلامی'] : [],
    guidance: withGuidance ? guidanceFor(verdict) : null,
  };
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
      '/precheck': precheckResponse('ALLOW', 'بستر با معیارهای پایه مطابقت دارد.'),
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

  async function getToReviewStep(
    user: ReturnType<typeof userEvent.setup>,
    verdict: string,
    reason: string,
    withGuidance = true
  ) {
    mockFetchByUrl({
      '/precheck': precheckResponse(verdict, reason, withGuidance),
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

  it('REVISE: shows what to change as an editable suggestion, no publish button', async () => {
    const user = userEvent.setup();
    await getToReviewStep(user, 'REVISE', 'برای ادامه، چند مورد را کامل کنید.');

    expect(await screen.findByText('توضیح هدف را کامل‌تر بنویسید.')).toBeInTheDocument();
    expect(screen.getByLabelText('متن پیشنهادی 1')).toHaveValue('متن کامل‌تر برای هدف');
    expect(screen.queryByRole('button', { name: 'انتشار' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ویرایش/ })).toBeInTheDocument();
  });

  it('REVISE: accepting the suggestions puts them in the form, not straight into the space', async () => {
    const user = userEvent.setup();
    await getToReviewStep(user, 'REVISE', 'برای ادامه، چند مورد را کامل کنید.');
    await screen.findByText('توضیح هدف را کامل‌تر بنویسید.');

    await user.click(screen.getByRole('button', { name: 'اعمال موارد انتخاب‌شده' }));

    // Back in their own form, with the accepted roles in the fields - so they
    // read them before they become their space.
    expect(await screen.findByLabelText('نقش اصلی اول')).toHaveValue('هماهنگ‌کننده');
    expect(screen.getByLabelText('نقش اصلی دوم')).toHaveValue('مشارکت‌کننده');
  });

  it('HUMAN_REVIEW: says a person is looking and that it is not a violation, no publish button', async () => {
    const user = userEvent.setup();
    await getToReviewStep(user, 'HUMAN_REVIEW', 'این درخواست را یک نفر بررسی می‌کند.');

    expect(await screen.findByText(/یک نفر این درخواست را بررسی می‌کند/)).toBeInTheDocument();
    expect(screen.getByText(/این به معنای تخلف نیست/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'انتشار' })).not.toBeInTheDocument();
  });

  it('BLOCK: cites the rule, states no public page will be created, no publish button', async () => {
    const user = userEvent.setup();
    await getToReviewStep(user, 'BLOCK', 'این درخواست با یک قاعدهٔ صریح مغایرت دارد.');

    expect(await screen.findByText('gambling@v1 — قانون مجازات اسلامی')).toBeInTheDocument();
    expect(screen.getByText(/منتشر نخواهد شد/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'انتشار' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'اعمال موارد انتخاب‌شده' })).not.toBeInTheDocument();
  });

  it('an outage: a verdict with no guidance still explains itself and offers a way back', async () => {
    const user = userEvent.setup();
    await getToReviewStep(
      user,
      'HUMAN_REVIEW',
      'بررسی خودکار در دسترس نبود، بنابراین یک نفر این درخواست را بررسی می‌کند.',
      false
    );

    expect(await screen.findByText(/بررسی خودکار در دسترس نبود/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'انتشار' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'بازگشت و ویرایش' })).toBeInTheDocument();
  });
});

describe('SpaceComposer: a blocked title never becomes a space', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('shows the reason from the API and stays on the describe step', async () => {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/spaces') && !url.includes('similar')) {
        return Promise.resolve(
          jsonResponse(422, {
            error: {
              code: 'SPACE_BLOCKED',
              message: 'این عنوان با یکی از قواعد صریح پلتفرم مغایرت دارد. عنوان دیگری بنویسید.',
              correlationId: 'test',
            },
          })
        );
      }
      return Promise.resolve(jsonResponse(200, { items: [] }));
    }) as unknown as typeof fetch;

    const user = userEvent.setup();
    render(<SpaceComposer />);
    await user.type(screen.getByLabelText('عنوان بستر'), 'باشگاه قمار محله');
    await user.click(screen.getByRole('button', { name: 'ادامه' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('عنوان دیگری بنویسید.');
    // Still on the first step: nothing was created, so there is nothing to
    // go back to.
    expect(screen.getByLabelText('عنوان بستر')).toBeInTheDocument();
  });
});
