import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SpaceComposer } from './SpaceComposer';

const originalFetch = global.fetch;
const SPACE_ID = '11111111-1111-4111-8111-111111111111';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function buildResponse(overrides: Record<string, unknown> = {}) {
  return {
    outcome: 'PUBLISHED',
    space: { id: SPACE_ID, slug: 'امانت-ابزار-محله' },
    reason: 'بستر ساخته و منتشر شد.',
    matchedPolicyRules: [],
    policyVersionRef: 'baseline:v1:8rules',
    creativityApplied: true,
    ...overrides,
  };
}

/**
 * URL-routing rather than call order: SimilarSpaces debounces a request of
 * its own, so it can land before or after the build call.
 */
function mockFetch(build: unknown, status = 200) {
  const calls: { url: string; body: unknown }[] = [];
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.includes('/spaces/build')) return Promise.resolve(jsonResponse(status, build));
    return Promise.resolve(jsonResponse(200, { items: [] }));
  }) as unknown as typeof fetch;
  return calls;
}

const PROMPT = 'می‌خواهم همسایه‌ها وسایلی مثل نردبان را به هم امانت بدهند';

describe('SpaceComposer: one prompt and nothing else', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    push.mockReset();
    vi.restoreAllMocks();
  });

  it('asks for no field but the prompt', () => {
    render(<SpaceComposer />);

    expect(screen.getByLabelText('چه بستری می‌خواهید؟')).toBeInTheDocument();
    // The whole point of the change: no title, purpose, methods or roles.
    for (const gone of ['عنوان بستر', 'این بستر برای چیست؟', 'نقش اصلی اول', 'روش‌های مشارکت (با ویرگول جدا کنید)']) {
      expect(screen.queryByLabelText(gone), gone).not.toBeInTheDocument();
    }
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
  });

  it('says the space can be edited afterwards, so nothing feels final', () => {
    render(<SpaceComposer />);
    expect(screen.getByText(/بعد از انتشار می‌توانید هر بخش را ویرایش کنید/)).toBeInTheDocument();
  });

  it('sends only the prompt', async () => {
    const calls = mockFetch(buildResponse());
    const user = userEvent.setup();
    render(<SpaceComposer />);

    await user.type(screen.getByLabelText('چه بستری می‌خواهید؟'), PROMPT);
    await user.click(screen.getByRole('button', { name: 'ساخت بستر' }));

    await waitFor(() => expect(push).toHaveBeenCalled());
    const build = calls.find((call) => call.url.includes('/spaces/build'))!;
    expect(build.body).toEqual({ prompt: PROMPT });
  });

  it('takes the person to their new space', async () => {
    mockFetch(buildResponse());
    const user = userEvent.setup();
    render(<SpaceComposer />);

    await user.type(screen.getByLabelText('چه بستری می‌خواهید؟'), PROMPT);
    await user.click(screen.getByRole('button', { name: 'ساخت بستر' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith(expect.stringContaining('/spaces/')));
    expect(push.mock.calls[0]![0]).toContain('built=published');
    expect(push.mock.calls[0]![0]).toContain('ai=1');
  });

  it('says so when rules built it rather than a model', async () => {
    mockFetch(buildResponse({ creativityApplied: false }));
    const user = userEvent.setup();
    render(<SpaceComposer />);

    await user.type(screen.getByLabelText('چه بستری می‌خواهید؟'), PROMPT);
    await user.click(screen.getByRole('button', { name: 'ساخت بستر' }));

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(push.mock.calls[0]![0]).toContain('ai=0');
  });

  it('takes them to a space that is waiting for a person, too', async () => {
    mockFetch(buildResponse({ outcome: 'HUMAN_REVIEW' }));
    const user = userEvent.setup();
    render(<SpaceComposer />);

    await user.type(screen.getByLabelText('چه بستری می‌خواهید؟'), PROMPT);
    await user.click(screen.getByRole('button', { name: 'ساخت بستر' }));

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(push.mock.calls[0]![0]).toContain('built=review');
  });

  it('shows the rule and keeps their words when a prompt is refused', async () => {
    mockFetch(
      buildResponse({
        outcome: 'BLOCKED',
        space: null,
        reason: 'این درخواست با یکی از قواعد صریح پلتفرم مغایرت دارد و بستری ساخته نشد. متن دیگری بنویسید.',
        matchedPolicyRules: ['gambling@v1 — قانون مجازات اسلامی'],
      })
    );
    const user = userEvent.setup();
    render(<SpaceComposer />);

    await user.type(screen.getByLabelText('چه بستری می‌خواهید؟'), 'بستری برای شرط‌بندی');
    await user.click(screen.getByRole('button', { name: 'ساخت بستر' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('بستری ساخته نشد');
    expect(screen.getByText('gambling@v1 — قانون مجازات اسلامی')).toBeInTheDocument();
    // Rewriting is an edit, not a retype.
    expect(screen.getByLabelText('چه بستری می‌خواهید؟')).toHaveValue('بستری برای شرط‌بندی');
    expect(push).not.toHaveBeenCalled();
  });

  it('refuses to send an empty prompt', async () => {
    const calls = mockFetch(buildResponse());
    const user = userEvent.setup();
    render(<SpaceComposer />);

    await user.click(screen.getByRole('button', { name: 'ساخت بستر' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('بنویسید چه بستری می‌خواهید.');
    expect(calls.some((call) => call.url.includes('/spaces/build'))).toBe(false);
  });

  it('says it is working, because building takes a moment', async () => {
    let release: (value: Response) => void = () => {};
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/spaces/build')) return new Promise<Response>((resolve) => { release = resolve; });
      return Promise.resolve(jsonResponse(200, { items: [] }));
    }) as unknown as typeof fetch;

    const user = userEvent.setup();
    render(<SpaceComposer />);
    await user.type(screen.getByLabelText('چه بستری می‌خواهید؟'), PROMPT);
    await user.click(screen.getByRole('button', { name: 'ساخت بستر' }));

    expect(await screen.findByRole('status')).toHaveTextContent('در حال ساخت بستر');
    expect(screen.getByRole('button', { name: 'در حال ساخت...' })).toBeDisabled();

    release(jsonResponse(200, buildResponse()));
    await waitFor(() => expect(push).toHaveBeenCalled());
  });

  it('reports a failure without losing the prompt', async () => {
    mockFetch({ error: { code: 'BOOM', message: 'سرویس در دسترس نیست.', correlationId: 'x' } }, 503);
    const user = userEvent.setup();
    render(<SpaceComposer />);

    await user.type(screen.getByLabelText('چه بستری می‌خواهید؟'), PROMPT);
    await user.click(screen.getByRole('button', { name: 'ساخت بستر' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('سرویس در دسترس نیست.');
    expect(screen.getByLabelText('چه بستری می‌خواهید؟')).toHaveValue(PROMPT);
  });
});
