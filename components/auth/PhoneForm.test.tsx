import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhoneForm } from './PhoneForm';

const originalFetch = global.fetch;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('PhoneForm', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('sets a right-to-left direction', () => {
    const { container } = render(<PhoneForm onRequested={vi.fn()} />);
    expect(container.firstElementChild).toHaveAttribute('dir', 'rtl');
  });

  it('shows a country selector defaulting to Iran', () => {
    render(<PhoneForm onRequested={vi.fn()} />);
    const select = screen.getByLabelText('کشور') as HTMLSelectElement;
    expect(select.value).toBe('IR');
  });

  it('lists the neighboring-country allow-list as options, with no age field anywhere', () => {
    render(<PhoneForm onRequested={vi.fn()} />);
    for (const country of ['ایران', 'عراق', 'ترکیه', 'آذربایجان', 'ارمنستان', 'ترکمنستان', 'افغانستان', 'پاکستان']) {
      expect(screen.getByRole('option', { name: country })).toBeInTheDocument();
    }
    expect(screen.queryByLabelText(/سن/)).not.toBeInTheDocument();
  });

  it('shows the acceptance text with links to the current terms and privacy pages, above the CTA, with no separate mandatory checkbox', () => {
    render(<PhoneForm onRequested={vi.fn()} />);
    // The sentence is split across text nodes by the two inline links, so
    // match on the dedicated container's full text content rather than one node.
    expect(screen.getByTestId('acceptance-text').textContent).toContain(
      'ثبت‌نام و ورود به منزلهٔ پذیرش قوانین و مقررات و حریم خصوصی جامعهٔ تعاون‌آفرینی است.'
    );
    expect(screen.getByRole('link', { name: /قوانین/ })).toHaveAttribute('href', '/legal/terms');
    expect(screen.getByRole('link', { name: /حریم خصوصی/ })).toHaveAttribute('href', '/legal/privacy');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('accepts Persian digits in the phone field and submits successfully', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(202, { challengeId: 'c1', expiresInSeconds: 300, termsVersion: 1, privacyVersion: 1 })
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    const onRequested = vi.fn();

    render(<PhoneForm onRequested={onRequested} />);
    await userEvent.type(screen.getByLabelText('شماره موبایل'), '۰۹۱۲۱۲۳۴۵۶۷');
    await userEvent.click(screen.getByRole('button', { name: /دریافت کد/ }));

    await waitFor(() => expect(onRequested).toHaveBeenCalledTimes(1));
    expect(onRequested).toHaveBeenCalledWith(
      { challengeId: 'c1', expiresInSeconds: 300, termsVersion: 1, privacyVersion: 1 },
      '۰۹۱۲۱۲۳۴۵۶۷',
      'IR'
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ phone: '۰۹۱۲۱۲۳۴۵۶۷', country: 'IR' });
  });

  it('shows an accessible error when the phone field is empty on submit, without calling the API', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<PhoneForm onRequested={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /دریافت کد/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/شماره/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the server error message and a Retry-After-aware notice when rate-limited', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(429, {
        error: { code: 'RATE_LIMITED', message: 'درخواست‌های شما بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.', correlationId: 'req-1', details: [] },
      })
    ) as unknown as typeof fetch;

    render(<PhoneForm onRequested={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('شماره موبایل'), '09121234567');
    await userEvent.click(screen.getByRole('button', { name: /دریافت کد/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('درخواست‌های شما بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.');
  });

  it('shows an update notice banner when provided (post LEGAL_VERSION_CHANGED bounce-back)', () => {
    render(<PhoneForm onRequested={vi.fn()} notice="قوانین به‌روزرسانی شده است." />);
    expect(screen.getByText('قوانین به‌روزرسانی شده است.')).toBeInTheDocument();
  });

  it('disables the submit button while the request is in flight', async () => {
    let resolveFetch: (value: Response) => void = () => {};
    global.fetch = vi.fn().mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; })) as unknown as typeof fetch;

    render(<PhoneForm onRequested={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('شماره موبایل'), '09121234567');
    const button = screen.getByRole('button', { name: /دریافت کد/ });
    await userEvent.click(button);

    expect(button).toBeDisabled();
    resolveFetch(jsonResponse(202, { challengeId: 'c1', expiresInSeconds: 300, termsVersion: 1, privacyVersion: 1 }));
  });
});
