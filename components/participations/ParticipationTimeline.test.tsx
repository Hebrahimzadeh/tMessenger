import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ParticipationTimeline } from './ParticipationTimeline';

const originalFetch = global.fetch;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('ParticipationTimeline ("timeline خصوصی و pagination زمانی"، بدون filter/category/score)', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('shows a real empty state with no participation history', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { items: [], nextCursor: null })) as unknown as typeof fetch;
    render(<ParticipationTimeline />);
    await waitFor(() => expect(screen.getByText('هنوز مشارکتی ثبت نشده است.')).toBeInTheDocument());
  });

  it('lists items with only a type label, a time, and a deep-link - no category/status/score anywhere', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        items: [{ type: 'PRODUCED', createdAt: '2026-09-10T10:00:00.000Z', deepLink: '/cards/x' }],
        nextCursor: null,
      })
    ) as unknown as typeof fetch;

    render(<ParticipationTimeline />);
    await waitFor(() => expect(screen.getByText('کارتی ساختید')).toBeInTheDocument());
    expect(screen.getByRole('link')).toHaveAttribute('href', '/cards/x');
  });

  it('has no filter chip, category tab, or search box anywhere on the page', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(200, { items: [{ type: 'PRODUCED', createdAt: '2026-09-10T10:00:00.000Z', deepLink: null }], nextCursor: null })
    ) as unknown as typeof fetch;

    render(<ParticipationTimeline />);
    await waitFor(() => expect(screen.getByText('کارتی ساختید')).toBeInTheDocument());
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/امتیاز|خلاصه/)).not.toBeInTheDocument();
  });

  it('loads older items via the cursor button', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { items: [{ type: 'PRODUCED', createdAt: '2026-09-10T10:00:00.000Z', deepLink: null }], nextCursor: 'cursor-1' })
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { items: [{ type: 'APPLIED', createdAt: '2026-09-09T10:00:00.000Z', deepLink: null }], nextCursor: null })
      ) as unknown as typeof fetch;

    render(<ParticipationTimeline />);
    await waitFor(() => expect(screen.getByText('کارتی ساختید')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'نمایش موارد قدیمی‌تر' }));
    await waitFor(() => expect(screen.getByText('به نقشی پیوستید')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'نمایش موارد قدیمی‌تر' })).not.toBeInTheDocument();
  });
});
