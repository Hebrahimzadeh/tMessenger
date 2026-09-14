import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { NotificationView } from '@taavon/contracts';
import { NotificationCenter } from './NotificationCenter';

const originalFetch = global.fetch;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function notification(over: Partial<NotificationView> = {}): NotificationView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    type: 'NEW_PUBLIC_REPLY',
    subjectType: 'CardComment',
    subjectId: '22222222-2222-4222-8222-222222222222',
    deepLink: '/cards/abc',
    preview: null,
    readAt: null,
    createdAt: '2026-09-15T08:00:00.000Z',
    ...over,
  };
}

interface ServerState {
  items: NotificationView[];
  unreadCount: number;
  nextCursor: string | null;
  privateMessagePreview: boolean;
}

function mockServer(initial: Partial<ServerState> = {}) {
  const state: ServerState = {
    items: [notification()],
    unreadCount: 1,
    nextCursor: null,
    privateMessagePreview: true,
    ...initial,
  };
  const calls: string[] = [];

  global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${url}`);

    if (url.includes('/me/notification-preferences')) {
      if (method === 'PATCH') {
        const body = JSON.parse(String(init?.body)) as { privateMessagePreview?: boolean };
        if (body.privateMessagePreview !== undefined) {
          state.privateMessagePreview = body.privateMessagePreview;
          // The server drops previews when the preference goes off; the
          // component re-reads, so the list must reflect that.
          state.items = state.items.map((n) =>
            n.type === 'NEW_PRIVATE_MESSAGE' ? { ...n, preview: state.privateMessagePreview ? 'سلام' : null } : n
          );
        }
      }
      return jsonResponse(200, { privateMessagePreview: state.privateMessagePreview });
    }

    if (url.includes('/me/notifications/read')) {
      state.items = state.items.map((n) => (n.readAt ? n : { ...n, readAt: '2026-09-15T09:00:00.000Z' }));
      const updated = state.unreadCount;
      state.unreadCount = 0;
      return jsonResponse(200, { updated, unreadCount: 0 });
    }

    return jsonResponse(200, { items: state.items, nextCursor: state.nextCursor, unreadCount: state.unreadCount });
  }) as unknown as typeof fetch;

  return { state, calls };
}

beforeEach(() => {
  mockServer();
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('the notification center', () => {
  it('lists what is waiting, with the unread total', async () => {
    render(<NotificationCenter />);

    expect(await screen.findByTestId('notification')).toBeInTheDocument();
    expect(screen.getByTestId('unread-total')).toHaveTextContent('1');
    expect(screen.getByText('پاسخ تازه در گفت‌وگوی عمومی')).toBeInTheDocument();
  });

  it('links each one to where it happened', async () => {
    render(<NotificationCenter />);
    expect(await screen.findByTestId('notification')).toHaveAttribute('href', '/cards/abc');
  });

  it('marks an unread one visibly different from a read one', async () => {
    mockServer({
      items: [
        notification({ id: '33333333-3333-4333-8333-333333333333', readAt: null }),
        notification({ id: '44444444-4444-4444-8444-444444444444', readAt: '2026-09-15T07:00:00.000Z' }),
      ],
    });
    render(<NotificationCenter />);

    const rows = await screen.findAllByTestId('notification');
    expect(rows[0]).toHaveAttribute('data-read', 'false');
    expect(rows[1]).toHaveAttribute('data-read', 'true');
  });

  it('marks everything read in one press, and then disables the button', async () => {
    render(<NotificationCenter />);
    const button = await screen.findByRole('button', { name: 'خواندن همه' });

    await userEvent.click(button);

    await waitFor(() => expect(screen.queryByTestId('unread-total')).not.toBeInTheDocument());
    expect(button).toBeDisabled();
    expect((await screen.findAllByTestId('notification'))[0]).toHaveAttribute('data-read', 'true');
  });

  it('offers nothing to press when there is nothing unread', async () => {
    mockServer({ items: [notification({ readAt: '2026-09-15T07:00:00.000Z' })], unreadCount: 0 });
    render(<NotificationCenter />);

    expect(await screen.findByRole('button', { name: 'خواندن همه' })).toBeDisabled();
  });

  it('says so plainly when there is nothing at all', async () => {
    mockServer({ items: [], unreadCount: 0 });
    render(<NotificationCenter />);

    expect(await screen.findByText('اعلانی ندارید.')).toBeInTheDocument();
  });

  it('pages when there is more', async () => {
    mockServer({ nextCursor: 'next-page' });
    render(<NotificationCenter />);

    const more = await screen.findByRole('button', { name: 'بیشتر' });
    await userEvent.click(more);

    await waitFor(() => expect(screen.getAllByTestId('notification').length).toBeGreaterThan(0));
  });

  it('shows an error rather than an empty page when loading fails', async () => {
    global.fetch = vi.fn().mockImplementation(async () =>
      jsonResponse(500, { error: { code: 'SERVER_ERROR', message: 'خطای سرور', correlationId: 'x', details: [] } })
    ) as unknown as typeof fetch;

    render(<NotificationCenter />);
    expect(await screen.findByRole('alert')).toHaveTextContent('خطای سرور');
  });
});

describe('the private-message preview toggle', () => {
  const privateItem = notification({
    id: '55555555-5555-4555-8555-555555555555',
    type: 'NEW_PRIVATE_MESSAGE',
    subjectType: 'Message',
    preview: 'سلام',
  });

  it('shows the preview while it is on', async () => {
    mockServer({ items: [privateItem] });
    render(<NotificationCenter />);

    expect(await screen.findByTestId('notification-preview')).toHaveTextContent('سلام');
    expect(screen.getByLabelText('نمایش خلاصهٔ پیام خصوصی')).toBeChecked();
  });

  it('removes previews already on screen the moment it is switched off', async () => {
    mockServer({ items: [privateItem] });
    render(<NotificationCenter />);

    expect(await screen.findByTestId('notification-preview')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('نمایش خلاصهٔ پیام خصوصی'));

    // The excerpt goes, and the notification itself stays - you still learn
    // someone wrote to you.
    await waitFor(() => expect(screen.queryByTestId('notification-preview')).not.toBeInTheDocument());
    expect(screen.getByTestId('notification')).toHaveAttribute('data-type', 'NEW_PRIVATE_MESSAGE');
  });

  it('starts from whatever the person chose last time', async () => {
    mockServer({ items: [notification({ ...privateItem, preview: null })], privateMessagePreview: false });
    render(<NotificationCenter />);

    await waitFor(() => expect(screen.getByLabelText('نمایش خلاصهٔ پیام خصوصی')).not.toBeChecked());
    expect(screen.queryByTestId('notification-preview')).not.toBeInTheDocument();
  });

  it('explains what switching it off does and does not do', async () => {
    render(<NotificationCenter />);
    expect(await screen.findByText(/باز هم خبردار می‌شوید که کسی پیام داده/)).toBeInTheDocument();
  });
});
