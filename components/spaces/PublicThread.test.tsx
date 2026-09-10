import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { PublicThread } from './PublicThread';

const originalFetch = global.fetch;
const CARD_ID = '11111111-1111-4111-8111-111111111111';
const AUTHOR = '22222222-2222-4222-8222-222222222222';
const STRANGER = '33333333-3333-4333-8333-333333333333';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function comment(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    cardId: CARD_ID,
    authorId: AUTHOR,
    parentId: null,
    status: 'VISIBLE',
    body: 'اولین نظر',
    revisionCount: 1,
    edited: false,
    createdAt: '2026-09-10T00:00:00.000Z',
    updatedAt: '2026-09-10T00:00:00.000Z',
    ...over,
  };
}

/**
 * Routes fetch calls by method + endpoint shape, popping one queued
 * response per call: `.../comments` (list/create) vs `.../comments/:id`
 * (edit/delete) are told apart by segment position, not brittle string
 * matching.
 */
function mockFetchRouter(routes: Record<string, unknown[]>) {
  const queues = new Map(Object.entries(routes).map(([k, v]) => [k, [...v]]));
  return vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? 'GET').toUpperCase();
    const segments = url.pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1];
    const secondLast = segments[segments.length - 2];

    let key: string | null = null;
    if (last === 'comments') key = `${method} /comments`;
    else if (secondLast === 'comments') key = `${method} /comments/:id`;

    const queue = key ? queues.get(key) : undefined;
    if (queue && queue.length > 0) return queue.shift()!;
    throw new Error(`Unmocked request: ${method} ${url.pathname}`);
  });
}

describe('PublicThread', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders the empty state when there are no comments yet', async () => {
    global.fetch = mockFetchRouter({
      'GET /comments': [jsonResponse(200, { items: [], nextCursor: null })],
    }) as unknown as typeof fetch;

    render(<PublicThread cardId={CARD_ID} currentUserId={AUTHOR} />);
    await waitFor(() => expect(screen.getByText(/هنوز نظری ثبت نشده/)).toBeInTheDocument());
  });

  it('renders top-level comments and their nested replies', async () => {
    const parent = comment({ id: '55555555-5555-4555-8555-555555555555', body: 'سوال من' });
    const reply = comment({
      id: '66666666-6666-4666-8666-666666666666',
      authorId: STRANGER,
      parentId: parent.id,
      body: 'پاسخ من',
    });

    global.fetch = mockFetchRouter({
      'GET /comments': [jsonResponse(200, { items: [parent, reply], nextCursor: null })],
    }) as unknown as typeof fetch;

    render(<PublicThread cardId={CARD_ID} currentUserId={AUTHOR} />);
    await waitFor(() => expect(screen.getByText('سوال من')).toBeInTheDocument());
    expect(screen.getByText('پاسخ من')).toBeInTheDocument();
  });

  it('hides the body of a deleted comment', async () => {
    global.fetch = mockFetchRouter({
      'GET /comments': [jsonResponse(200, { items: [comment({ status: 'DELETED', body: null })], nextCursor: null })],
    }) as unknown as typeof fetch;

    render(<PublicThread cardId={CARD_ID} currentUserId={AUTHOR} />);
    await waitFor(() => expect(screen.getByText('این نظر حذف شده است.')).toBeInTheDocument());
    expect(screen.queryByText('اولین نظر')).not.toBeInTheDocument();
  });

  it('shows edit/delete only for the caller\'s own comment, not a stranger\'s', async () => {
    global.fetch = mockFetchRouter({
      'GET /comments': [
        jsonResponse(200, {
          items: [
            comment({ id: '77777777-7777-4777-8777-777777777777', authorId: AUTHOR, body: 'نظر خودم' }),
            comment({ id: '88888888-8888-4888-8888-888888888888', authorId: STRANGER, body: 'نظر دیگری' }),
          ],
          nextCursor: null,
        }),
      ],
    }) as unknown as typeof fetch;

    render(<PublicThread cardId={CARD_ID} currentUserId={AUTHOR} />);
    await waitFor(() => expect(screen.getByText('نظر خودم')).toBeInTheDocument());

    const mine = screen.getByText('نظر خودم').closest('li')!;
    const theirs = screen.getByText('نظر دیگری').closest('li')!;
    expect(within(mine).getByText('ویرایش')).toBeInTheDocument();
    expect(within(mine).getByText('حذف')).toBeInTheDocument();
    expect(within(theirs).queryByText('ویرایش')).not.toBeInTheDocument();
    expect(within(theirs).queryByText('حذف')).not.toBeInTheDocument();
  });

  it('lets a moderator delete someone else\'s comment', async () => {
    global.fetch = mockFetchRouter({
      'GET /comments': [jsonResponse(200, { items: [comment({ authorId: STRANGER })], nextCursor: null })],
    }) as unknown as typeof fetch;

    render(<PublicThread cardId={CARD_ID} currentUserId={AUTHOR} canModerate />);
    await waitFor(() => expect(screen.getByText('حذف')).toBeInTheDocument());
  });

  it('posts a new top-level comment optimistically, then reconciles with the server response', async () => {
    const created = comment({ id: '99999999-9999-4999-8999-999999999999', body: 'نظر تازه' });
    global.fetch = mockFetchRouter({
      'GET /comments': [jsonResponse(200, { items: [], nextCursor: null })],
      'POST /comments': [jsonResponse(201, created)],
    }) as unknown as typeof fetch;

    render(<PublicThread cardId={CARD_ID} currentUserId={AUTHOR} />);
    await waitFor(() => expect(screen.getByText(/هنوز نظری ثبت نشده/)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('متن نظر'), { target: { value: 'نظر تازه' } });
    fireEvent.click(screen.getByRole('button', { name: 'پرسش یا مشارکت عمومی' }));

    // Optimistic insert happens immediately, before the network call resolves.
    await waitFor(() => expect(screen.getByText('نظر تازه')).toBeInTheDocument());
  });

  it('rolls back the optimistic comment if the server rejects it', async () => {
    global.fetch = mockFetchRouter({
      'GET /comments': [jsonResponse(200, { items: [], nextCursor: null })],
      'POST /comments': [jsonResponse(422, { error: { code: 'COMMENTS_NOT_ACCEPTED', message: 'رد شد.', correlationId: 'x' } })],
    }) as unknown as typeof fetch;

    render(<PublicThread cardId={CARD_ID} currentUserId={AUTHOR} />);
    await waitFor(() => expect(screen.getByText(/هنوز نظری ثبت نشده/)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('متن نظر'), { target: { value: 'رد خواهد شد' } });
    fireEvent.click(screen.getByRole('button', { name: 'پرسش یا مشارکت عمومی' }));

    await waitFor(() => expect(screen.getByText(/هنوز نظری ثبت نشده/)).toBeInTheDocument());
  });

  it('edits the caller\'s own comment through the PATCH endpoint', async () => {
    const original = comment({ body: 'قبل از ویرایش' });
    const edited = comment({ body: 'بعد از ویرایش', revisionCount: 2, edited: true });
    global.fetch = mockFetchRouter({
      'GET /comments': [jsonResponse(200, { items: [original], nextCursor: null })],
      'PATCH /comments/:id': [jsonResponse(200, edited)],
    }) as unknown as typeof fetch;

    render(<PublicThread cardId={CARD_ID} currentUserId={AUTHOR} />);
    await waitFor(() => expect(screen.getByText('قبل از ویرایش')).toBeInTheDocument());

    fireEvent.click(screen.getByText('ویرایش'));
    const editBox = screen.getAllByLabelText('متن نظر')[1]!; // [0] is the top composer, [1] the inline edit box
    fireEvent.change(editBox, { target: { value: 'بعد از ویرایش' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیرهٔ ویرایش' }));

    await waitFor(() => expect(screen.getByText('بعد از ویرایش')).toBeInTheDocument());
    expect(screen.getByText('(ویرایش‌شده)')).toBeInTheDocument();
  });

  it('soft-deletes the caller\'s own comment through the DELETE endpoint', async () => {
    global.fetch = mockFetchRouter({
      'GET /comments': [jsonResponse(200, { items: [comment({ body: 'حذف‌شدنی' })], nextCursor: null })],
      'DELETE /comments/:id': [jsonResponse(200, comment({ status: 'DELETED', body: null }))],
    }) as unknown as typeof fetch;

    render(<PublicThread cardId={CARD_ID} currentUserId={AUTHOR} />);
    await waitFor(() => expect(screen.getByText('حذف‌شدنی')).toBeInTheDocument());

    fireEvent.click(screen.getByText('حذف'));
    await waitFor(() => expect(screen.getByText('این نظر حذف شده است.')).toBeInTheDocument());
  });

  it('loads more comments via the cursor button', async () => {
    global.fetch = mockFetchRouter({
      'GET /comments': [
        jsonResponse(200, { items: [comment({ body: 'صفحهٔ اول' })], nextCursor: 'cursor-1' }),
        jsonResponse(200, { items: [comment({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', body: 'صفحهٔ دوم' })], nextCursor: null }),
      ],
    }) as unknown as typeof fetch;

    render(<PublicThread cardId={CARD_ID} currentUserId={AUTHOR} />);
    await waitFor(() => expect(screen.getByText('صفحهٔ اول')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'نمایش نظرهای بیشتر' }));
    await waitFor(() => expect(screen.getByText('صفحهٔ دوم')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'نمایش نظرهای بیشتر' })).not.toBeInTheDocument();
  });
});
