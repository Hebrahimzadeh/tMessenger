import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SpaceResponse } from '@taavon/contracts';
import { SpaceEditForm } from './SpaceEditForm';

const originalFetch = global.fetch;
const SPACE_ID = '11111111-1111-4111-8111-111111111111';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function space(overrides: Partial<SpaceResponse['definition']> = {}): SpaceResponse {
  return {
    id: SPACE_ID,
    slug: 'امانت-ابزار-محله',
    status: 'PUBLISHED',
    creatorId: '22222222-2222-4222-8222-222222222222',
    publishedAt: '2026-09-17T00:00:00.000Z',
    archivedAt: null,
    canManage: true,
    followerCount: 3,
    isFollowing: true,
    definition: {
      versionNumber: 1,
      title: 'امانت ابزار محله',
      purpose: 'این بستر جایی است برای امانت‌دادن و امانت‌گرفتن وسایلی که کم استفاده می‌شوند.',
      audience: 'اهالی محله',
      participationMethods: ['ثبت کارت وسیله', 'گفت‌وگوی عمومی'],
      cardHints: [{ isExample: true, label: 'نمونه', title: 'نردبان برای امانت' }],
      policyVersion: 1,
      roles: [
        { id: '33333333-3333-4333-8333-333333333331', key: 'primary-1', title: 'دارندهٔ وسیله', description: 'امانت می‌دهد.', isPrimary: true },
        { id: '33333333-3333-4333-8333-333333333332', key: 'primary-2', title: 'نیازمند وسیله', description: 'امانت می‌گیرد.', isPrimary: true },
        { id: '33333333-3333-4333-8333-333333333333', key: 'supporting-1', title: 'هماهنگ‌کننده', description: null, isPrimary: false },
      ],
      ...overrides,
    },
  };
}

function mockPatch(body: unknown, status = 200) {
  const calls: { url: string; method?: string; body: unknown }[] = [];
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return Promise.resolve(jsonResponse(status, body));
  }) as unknown as typeof fetch;
  return calls;
}

describe('SpaceEditForm', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('opens with what the space already says', () => {
    render(<SpaceEditForm space={space()} onSaved={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByLabelText('عنوان')).toHaveValue('امانت ابزار محله');
    expect(screen.getByLabelText('معرفی بستر')).toHaveValue(space().definition.purpose);
    expect(screen.getByLabelText('روش‌های مشارکت (با ویرگول جدا کنید)')).toHaveValue('ثبت کارت وسیله، گفت‌وگوی عمومی');
    expect(screen.getByLabelText('عنوان نقش 1')).toHaveValue('دارندهٔ وسیله');
  });

  it('saves the edit and keeps every role key, so memberships survive', async () => {
    const calls = mockPatch(space({ title: 'امانت ابزار کوچه' }));
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<SpaceEditForm space={space()} onSaved={onSaved} onCancel={vi.fn()} />);

    const title = screen.getByLabelText('عنوان');
    await user.clear(title);
    await user.type(title, 'امانت ابزار کوچه');
    await user.click(screen.getByRole('button', { name: 'ذخیرهٔ تغییرات' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const patch = calls[0]!;
    expect(patch.method).toBe('PATCH');
    expect(patch.url).toContain(`/spaces/${SPACE_ID}`);
    const sent = patch.body as { title: string; roles: { key: string }[]; cardHints: unknown[] };
    expect(sent.title).toBe('امانت ابزار کوچه');
    expect(sent.roles.map((r) => r.key)).toEqual(['primary-1', 'primary-2', 'supporting-1']);
    // Sample cards are not edited here, and are not dropped either.
    expect(sent.cardHints).toHaveLength(1);
  });

  it('splits the participation methods a person typed', async () => {
    const calls = mockPatch(space());
    const user = userEvent.setup();
    render(<SpaceEditForm space={space()} onSaved={vi.fn()} onCancel={vi.fn()} />);

    const methods = screen.getByLabelText('روش‌های مشارکت (با ویرگول جدا کنید)');
    await user.clear(methods);
    await user.type(methods, 'حضوری، آنلاین');
    await user.click(screen.getByRole('button', { name: 'ذخیرهٔ تغییرات' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect((calls[0]!.body as { participationMethods: string[] }).participationMethods).toEqual(['حضوری', 'آنلاین']);
  });

  it('drops a role whose title was cleared', async () => {
    const calls = mockPatch(space());
    const user = userEvent.setup();
    render(<SpaceEditForm space={space()} onSaved={vi.fn()} onCancel={vi.fn()} />);

    await user.clear(screen.getByLabelText('عنوان نقش 3'));
    await user.click(screen.getByRole('button', { name: 'ذخیرهٔ تغییرات' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect((calls[0]!.body as { roles: { key: string }[] }).roles.map((r) => r.key)).toEqual(['primary-1', 'primary-2']);
  });

  it('adds a role with a key that is not already taken', async () => {
    const user = userEvent.setup();
    render(<SpaceEditForm space={space()} onSaved={vi.fn()} onCancel={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '+ افزودن نقش' }));
    expect(screen.getByLabelText('عنوان نقش 4')).toBeInTheDocument();
  });

  it('shows why a refused edit was refused, with the rule', async () => {
    mockPatch(
      {
        error: {
          code: 'SPACE_EDIT_REFUSED',
          message: 'این ویرایش با یکی از قواعد صریح پلتفرم مغایرت دارد و اعمال نشد. نسخهٔ منتشرشده بدون تغییر ماند.',
          correlationId: 'x',
          details: ['gambling@v1 — قانون مجازات اسلامی'],
        },
      },
      422
    );
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<SpaceEditForm space={space()} onSaved={onSaved} onCancel={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'ذخیرهٔ تغییرات' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('نسخهٔ منتشرشده بدون تغییر ماند');
    expect(screen.getByText('gambling@v1 — قانون مجازات اسلامی')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('shows a structural refusal in plain words, with no rule to cite', async () => {
    mockPatch(
      { error: { code: 'SPACE_EDIT_REFUSED', message: 'دست‌کم یک روش مشارکت لازم است.', correlationId: 'x', details: [] } },
      422
    );
    const user = userEvent.setup();
    render(<SpaceEditForm space={space()} onSaved={vi.fn()} onCancel={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'ذخیرهٔ تغییرات' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('دست‌کم یک روش مشارکت لازم است.');
  });

  it('cancels without sending anything', async () => {
    const calls = mockPatch(space());
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<SpaceEditForm space={space()} onSaved={vi.fn()} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'انصراف' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(0);
  });
});
