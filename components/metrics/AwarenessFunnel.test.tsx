import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AwarenessFunnel } from './AwarenessFunnel';

const originalFetch = global.fetch;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('AwarenessFunnel ("فقط آمار تجمیعی و بدون score انسان")', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('shows aggregate totals summed across days, with no per-human id or score anywhere', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        days: [
          { date: '2031-01-01', producedCount: 2, meaningfulViewCount: 5, publicContributionCount: 3, appliedCount: 1, privateChatStartedCount: 1, reservationClosedCount: 1 },
          { date: '2031-01-02', producedCount: 1, meaningfulViewCount: 4, publicContributionCount: 2, appliedCount: 0, privateChatStartedCount: 1, reservationClosedCount: 0 },
        ],
      })
    ) as unknown as typeof fetch;

    render(<AwarenessFunnel />);
    await waitFor(() => expect(screen.getByText('قیف آگاهی')).toBeInTheDocument());

    expect(screen.getByText('۳')).toBeInTheDocument(); // produced total (2+1)
    expect(screen.getByText('۲.۵۰')).toBeInTheDocument(); // public/private ratio (5 public / 2 private)
    expect(screen.queryByText(/امتیاز/)).not.toBeInTheDocument();
    expect(JSON.stringify(document.body.innerHTML)).not.toContain('userId');
  });

  it('shows a real empty state when nothing has been computed yet', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { days: [] })) as unknown as typeof fetch;
    render(<AwarenessFunnel />);
    await waitFor(() => expect(screen.getByText('هنوز داده‌ای محاسبه نشده است.')).toBeInTheDocument());
  });

  it('shows the MFA challenge when the API requires a second factor', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(403, { error: { code: 'MFA_REQUIRED', message: 'نیاز به تأیید دومرحله‌ای', correlationId: 'x' } })
    ) as unknown as typeof fetch;
    render(<AwarenessFunnel />);
    await waitFor(() => expect(screen.getByRole('button', { name: /تأیید/ })).toBeInTheDocument());
  });
});
