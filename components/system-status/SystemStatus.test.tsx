import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SystemStatus } from './SystemStatus';
import { ApiError } from '@/lib/api/client';

vi.mock('@/lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return {
    ...actual,
    apiFetch: vi.fn(),
  };
});

const { apiFetch } = await import('@/lib/api/client');

describe('SystemStatus', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it('shows a loading state before the response arrives', () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}));

    render(<SystemStatus />);

    expect(screen.getByRole('status')).toHaveTextContent('در حال بررسی وضعیت سرویس‌ها');
  });

  it('shows each dependency check in Persian when every check is healthy', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      status: 'ok',
      checks: { database: 'ok', redis: 'ok', storage: 'ok' },
    });

    render(<SystemStatus />);

    await waitFor(() => expect(screen.getByText('وضعیت کلی: سالم')).toBeInTheDocument());
    expect(screen.getByText('پایگاه‌داده')).toBeInTheDocument();
    expect(screen.getByText('صف/کش (Redis)')).toBeInTheDocument();
    expect(screen.getByText('ذخیره‌سازی فایل')).toBeInTheDocument();
    expect(screen.getAllByText('سالم')).toHaveLength(3); // the three per-check labels; the overall-status line is asserted above
  });

  it('shows a degraded status distinctly from a fully healthy one', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      status: 'degraded',
      checks: { database: 'down', redis: 'ok', storage: 'ok' },
    });

    render(<SystemStatus />);

    await waitFor(() => expect(screen.getByText(/ناقص/)).toBeInTheDocument());
    expect(screen.getByText('قطع')).toBeInTheDocument();
  });

  it('shows an error state when the API call fails', async () => {
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiError(0, { code: 'NETWORK_ERROR', message: 'برقراری ارتباط با سرور ممکن نشد.', correlationId: 'test' })
    );

    render(<SystemStatus />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('برقراری ارتباط با سرور ممکن نشد.');
  });

  it('shows a validation error when the response does not match the shared schema', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ status: 'ok', checks: { database: 'ok' } });

    render(<SystemStatus />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('قرارداد مورد انتظار مطابقت ندارد');
  });
});
