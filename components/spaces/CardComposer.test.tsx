import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardComposer } from './CardComposer';

const originalFetch = global.fetch;
const SPACE_ID = '11111111-1111-4111-8111-111111111111';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function ladderInference(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'REUSABLE_RESOURCE',
    confidence: 0.7,
    suggestedTitle: 'نردبان برای امانت',
    suggestedBody: 'یک نردبان دارم و می‌توانم قرض بدهم.',
    assumptions: ['پس از بسته‌شدن، این کارت دوباره فعال نمی‌شود؛ دفعهٔ بعد کارت تازه‌ای بسازید.'],
    creativityApplied: true,
    operationalPattern: { reservable: true, terminalCloseAfterUse: true },
    clarifyingQuestions: [
      {
        topic: 'RETURNABILITY',
        question: 'بعد از استفاده باید به شما برگردانده شود؟',
        behaviorAffected: 'اگر بله، کارت پس از بسته‌شدنِ امانت تمام می‌شود.',
      },
    ],
    ...overrides,
  };
}

function createdCard(overrides: Record<string, unknown> = {}) {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    spaceId: SPACE_ID,
    authorId: '33333333-3333-4333-8333-333333333333',
    kind: 'AWARENESS',
    status: 'ACTIVE',
    publishedAt: '2026-09-10T00:00:00.000Z',
    revision: { revisionNumber: 1, title: 'یک کارت', body: 'یک کارت' },
    inferredKind: 'AWARENESS',
    attachments: [],
    ...overrides,
  };
}

/**
 * Routes by URL rather than by call order: the infer call and the create call
 * are separate endpoints and a chain keyed on order would break the moment a
 * test skipped one.
 */
function mockFetchByUrl(handlers: { infer?: unknown; create?: unknown; inferStatus?: number }) {
  const calls: { url: string; body: unknown }[] = [];
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.includes('/cards/infer')) {
      return Promise.resolve(jsonResponse(handlers.inferStatus ?? 200, handlers.infer ?? ladderInference()));
    }
    return Promise.resolve(jsonResponse(201, handlers.create ?? createdCard()));
  }) as unknown as typeof fetch;
  return calls;
}

describe('CardComposer ("تک‌ورودی و preview-first"، انتخاب kind اجباری نیست)', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('has no kind selector anywhere in the form', () => {
    render(<CardComposer spaceId={SPACE_ID} onCreated={vi.fn()} />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText(/گونه|kind/i)).not.toBeInTheDocument();
  });

  it('shows a live preview as soon as there is body text - plain generic text is always submittable', () => {
    render(<CardComposer spaceId={SPACE_ID} onCreated={vi.fn()} />);
    expect(screen.queryByText('پیش‌نمایش کارت')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('متن کارت'), { target: { value: 'یک متن کاملاً کلی و بدون ساختار خاص' } });

    expect(screen.getByText('پیش‌نمایش کارت')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ثبت کارت' })).not.toBeDisabled();
  });

  it('submits body-only and reports the created card', async () => {
    const onCreated = vi.fn();
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(201, {
        id: '22222222-2222-4222-8222-222222222222',
        spaceId: SPACE_ID,
        authorId: '33333333-3333-4333-8333-333333333333',
        kind: 'AWARENESS',
        status: 'ACTIVE',
        publishedAt: '2026-09-10T00:00:00.000Z',
        revision: { revisionNumber: 1, title: 'یک کارت متنی', body: 'یک کارت متنی' },
        inferredKind: 'AWARENESS',
        attachments: [],
      })
    ) as unknown as typeof fetch;

    render(<CardComposer spaceId={SPACE_ID} onCreated={onCreated} />);
    fireEvent.change(screen.getByLabelText('متن کارت'), { target: { value: 'یک کارت متنی' } });
    fireEvent.click(screen.getByRole('button', { name: 'ثبت کارت' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  });

  it('keeps the submit button disabled with no body and no attachment', () => {
    render(<CardComposer spaceId={SPACE_ID} onCreated={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'ثبت کارت' })).toBeDisabled();
  });
});


describe('the suggestion is an offer, not a step', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('is not offered until there is something to suggest about', () => {
    render(<CardComposer spaceId={SPACE_ID} onCreated={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'پیشنهاد برای این متن' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('متن کارت'), { target: { value: 'نردبان دارم' } });
    expect(screen.getByRole('button', { name: 'پیشنهاد برای این متن' })).toBeInTheDocument();
  });

  it('submits without ever asking for one, and sends no inference fields', async () => {
    const calls = mockFetchByUrl({});
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(<CardComposer spaceId={SPACE_ID} onCreated={onCreated} />);

    fireEvent.change(screen.getByLabelText('متن کارت'), { target: { value: 'یک متن کاملاً کلی' } });
    await user.click(screen.getByRole('button', { name: 'ثبت کارت' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    // The ordinary path never touches the inference endpoint at all, which is
    // what makes it identical with the model switched off.
    expect(calls.some((call) => call.url.includes('/infer'))).toBe(false);
    const created = calls.find((call) => !call.url.includes('/infer'))!;
    expect(created.body).not.toHaveProperty('kind');
    expect(created.body).not.toHaveProperty('confirmedInference');
  });

  it('shows the preview when asked, and applies nothing on its own', async () => {
    const calls = mockFetchByUrl({});
    const user = userEvent.setup();
    render(<CardComposer spaceId={SPACE_ID} onCreated={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('متن کارت'), { target: { value: 'یک نردبان دارم که قرض می‌دهم' } });
    await user.click(screen.getByRole('button', { name: 'پیشنهاد برای این متن' }));

    expect(await screen.findByText('پیشنهاد برای این کارت')).toBeInTheDocument();
    // Their own text is untouched until they say otherwise.
    expect(screen.getByLabelText('متن کارت')).toHaveValue('یک نردبان دارم که قرض می‌دهم');
    expect(calls.filter((call) => !call.url.includes('/infer'))).toHaveLength(0);
  });

  it('carries the confirmed kind onto the card when applied', async () => {
    const calls = mockFetchByUrl({});
    const user = userEvent.setup();
    render(<CardComposer spaceId={SPACE_ID} onCreated={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('متن کارت'), { target: { value: 'یک نردبان دارم که قرض می‌دهم' } });
    await user.click(screen.getByRole('button', { name: 'پیشنهاد برای این متن' }));
    await screen.findByText('پیشنهاد برای این کارت');
    await user.click(screen.getByRole('button', { name: 'اعمال موارد انتخاب‌شده' }));
    await user.click(screen.getByRole('button', { name: 'ثبت کارت' }));

    const created = calls.find((call) => !call.url.includes('/infer'))!;
    expect(created.body).toMatchObject({
      kind: 'REUSABLE_RESOURCE',
      body: 'یک نردبان دارم و می‌توانم قرض بدهم.',
      confirmedInference: { inferredKind: 'REUSABLE_RESOURCE', confidence: 0.7 },
    });
  });

  it('sends nothing extra when the suggestion is dismissed', async () => {
    const calls = mockFetchByUrl({});
    const user = userEvent.setup();
    render(<CardComposer spaceId={SPACE_ID} onCreated={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('متن کارت'), { target: { value: 'یک نردبان دارم که قرض می‌دهم' } });
    await user.click(screen.getByRole('button', { name: 'پیشنهاد برای این متن' }));
    await screen.findByText('پیشنهاد برای این کارت');
    await user.click(screen.getByRole('button', { name: 'نادیده بگیر' }));
    await user.click(screen.getByRole('button', { name: 'ثبت کارت' }));

    const created = calls.find((call) => !call.url.includes('/infer'))!;
    expect(created.body).toMatchObject({ body: 'یک نردبان دارم که قرض می‌دهم' });
    expect(created.body).not.toHaveProperty('kind');
    expect(created.body).not.toHaveProperty('confirmedInference');
  });

  it('keeps the card one click away when the suggestion cannot be fetched', async () => {
    const calls = mockFetchByUrl({ inferStatus: 503, infer: { error: { code: 'X', message: 'down', correlationId: 'c' } } });
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(<CardComposer spaceId={SPACE_ID} onCreated={onCreated} />);

    fireEvent.change(screen.getByLabelText('متن کارت'), { target: { value: 'یک نردبان دارم که قرض می‌دهم' } });
    await user.click(screen.getByRole('button', { name: 'پیشنهاد برای این متن' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('همان‌طور که نوشته‌اید ثبت کنید');
    await user.click(screen.getByRole('button', { name: 'ثبت کارت' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(calls.find((call) => !call.url.includes('/infer'))!.body).toMatchObject({
      body: 'یک نردبان دارم که قرض می‌دهم',
    });
  });

  it('shows the accepted kind in the preview card', async () => {
    mockFetchByUrl({});
    const user = userEvent.setup();
    render(<CardComposer spaceId={SPACE_ID} onCreated={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('متن کارت'), { target: { value: 'یک نردبان دارم که قرض می‌دهم' } });
    await user.click(screen.getByRole('button', { name: 'پیشنهاد برای این متن' }));
    await screen.findByText('پیشنهاد برای این کارت');
    await user.click(screen.getByRole('button', { name: 'اعمال موارد انتخاب‌شده' }));

    expect(screen.getByText('چیزی برای امانت')).toBeInTheDocument();
  });
});
