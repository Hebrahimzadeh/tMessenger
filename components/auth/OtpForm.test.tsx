import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OtpForm } from './OtpForm';

const originalFetch = global.fetch;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const baseProps = {
  phone: '09121234567',
  country: 'IR',
  challengeId: 'challenge-1',
  expiresInSeconds: 300,
  termsVersion: 1,
  privacyVersion: 1,
};

describe('OtpForm', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows a 6-digit code input that can be pasted into directly', async () => {
    render(<OtpForm {...baseProps} onVerified={vi.fn()} onLegalVersionChanged={vi.fn()} />);
    const input = screen.getByLabelText('کد تأیید') as HTMLInputElement;
    expect(input.maxLength).toBe(6);

    await userEvent.click(input);
    await userEvent.paste('123456');
    expect(input.value).toBe('123456');
  });

  it('shows a live countdown starting from expiresInSeconds and counting down', async () => {
    render(<OtpForm {...baseProps} onVerified={vi.fn()} onLegalVersionChanged={vi.fn()} />);
    expect(screen.getByTestId('countdown')).toHaveTextContent('۰۵:۰۰');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByTestId('countdown')).toHaveTextContent('۰۴:۵۹');
  });

  it('hides the resend button until the countdown reaches zero', async () => {
    render(<OtpForm {...baseProps} onVerified={vi.fn()} onLegalVersionChanged={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /ارسال دوباره/ })).not.toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(300_000);
    expect(screen.getByRole('button', { name: /ارسال دوباره/ })).toBeInTheDocument();
  });

  it('resend requests a new challenge and resets the countdown', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => 
      jsonResponse(202, { challengeId: 'challenge-2', expiresInSeconds: 300, termsVersion: 1, privacyVersion: 1 })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<OtpForm {...baseProps} onVerified={vi.fn()} onLegalVersionChanged={vi.fn()} />);
    await vi.advanceTimersByTimeAsync(300_000);

    await userEvent.click(screen.getByRole('button', { name: /ارسال دوباره/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/otp/request'),
      expect.objectContaining({ method: 'POST' })
    ));
    expect(screen.getByTestId('countdown')).toHaveTextContent('۰۵:۰۰');
  });

  it('calls onVerified with the userId on a correct code', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    global.fetch = vi.fn().mockImplementation(async () => jsonResponse(200, { userId })) as unknown as typeof fetch;
    const onVerified = vi.fn();

    render(<OtpForm {...baseProps} onVerified={onVerified} onLegalVersionChanged={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('کد تأیید'), '123456');
    await userEvent.click(screen.getByRole('button', { name: /تأیید کد/ }));

    await waitFor(() => expect(onVerified).toHaveBeenCalledWith(userId));
  });

  it('shows an accessible error message for an incorrect code, without calling onVerified', async () => {
    global.fetch = vi.fn().mockImplementation(async () => 
      jsonResponse(422, { error: { code: 'OTP_INVALID_CODE', message: 'کد وارد شده نادرست است.', correlationId: 'r1', details: [] } })
    ) as unknown as typeof fetch;
    const onVerified = vi.fn();

    render(<OtpForm {...baseProps} onVerified={onVerified} onLegalVersionChanged={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('کد تأیید'), '000000');
    await userEvent.click(screen.getByRole('button', { name: /تأیید کد/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('کد وارد شده نادرست است.');
    expect(onVerified).not.toHaveBeenCalled();
  });

  it('calls onLegalVersionChanged (not onVerified) when the server reports the legal version moved', async () => {
    global.fetch = vi.fn().mockImplementation(async () => 
      jsonResponse(422, {
        error: {
          code: 'LEGAL_VERSION_CHANGED',
          message: 'قوانین یا حریم خصوصی به‌روزرسانی شده است. لطفاً نسخهٔ جدید را مطالعه و دوباره تلاش کنید.',
          correlationId: 'r2',
          details: [{ termsVersion: 2, privacyVersion: 1, termsUrl: 'https://x/terms', privacyUrl: 'https://x/privacy' }],
        },
      })
    ) as unknown as typeof fetch;
    const onLegalVersionChanged = vi.fn();
    const onVerified = vi.fn();

    render(<OtpForm {...baseProps} onVerified={onVerified} onLegalVersionChanged={onLegalVersionChanged} />);
    await userEvent.type(screen.getByLabelText('کد تأیید'), '123456');
    await userEvent.click(screen.getByRole('button', { name: /تأیید کد/ }));

    await waitFor(() =>
      expect(onLegalVersionChanged).toHaveBeenCalledWith('قوانین یا حریم خصوصی به‌روزرسانی شده است. لطفاً نسخهٔ جدید را مطالعه و دوباره تلاش کنید.')
    );
    expect(onVerified).not.toHaveBeenCalled();
  });

  it('never writes the code to localStorage', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    global.fetch = vi.fn().mockImplementation(async () => 
      jsonResponse(200, { userId: '11111111-1111-4111-8111-111111111111' })
    ) as unknown as typeof fetch;

    render(<OtpForm {...baseProps} onVerified={vi.fn()} onLegalVersionChanged={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('کد تأیید'), '123456');
    await userEvent.click(screen.getByRole('button', { name: /تأیید کد/ }));

    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  describe('test deployments without an SMS gateway', () => {
    /** Answers the dev-sink probe with `code`, and anything else with `fallback`. */
    function routeFetch(code: string | null, fallback: () => Response) {
      return vi.fn().mockImplementation(async (url: string) =>
        url.includes('/auth/otp/_dev-sink') ? jsonResponse(200, { code }) : fallback()
      ) as unknown as typeof fetch;
    }

    it('shows the code and fills it in when the API is using the dev sink', async () => {
      global.fetch = routeFetch('654321', () => jsonResponse(200, {}));

      render(<OtpForm {...baseProps} onVerified={vi.fn()} onLegalVersionChanged={vi.fn()} />);

      expect(await screen.findByTestId('dev-sink-code')).toHaveTextContent('۶۵۴۳۲۱');
      await waitFor(() => expect((screen.getByLabelText('کد تأیید') as HTMLInputElement).value).toBe('654321'));
    });

    it('asks the sink for the number the person actually typed, with its country', async () => {
      const fetchMock = routeFetch('654321', () => jsonResponse(200, {}));
      global.fetch = fetchMock;

      render(<OtpForm {...baseProps} onVerified={vi.fn()} onLegalVersionChanged={vi.fn()} />);

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/auth/otp/_dev-sink?phone=09121234567&country=IR'),
          expect.anything()
        )
      );
    });

    it('shows nothing at all in production, where the route does not exist', async () => {
      global.fetch = vi.fn().mockImplementation(async () =>
        jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'یافت نشد.', correlationId: 'r3', details: [] } })
      ) as unknown as typeof fetch;

      render(<OtpForm {...baseProps} onVerified={vi.fn()} onLegalVersionChanged={vi.fn()} />);

      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      expect(screen.queryByTestId('dev-sink-code')).not.toBeInTheDocument();
      expect((screen.getByLabelText('کد تأیید') as HTMLInputElement).value).toBe('');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('stays quiet when the sink has no code recorded for that number yet', async () => {
      global.fetch = routeFetch(null, () => jsonResponse(200, {}));

      render(<OtpForm {...baseProps} onVerified={vi.fn()} onLegalVersionChanged={vi.fn()} />);

      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      expect(screen.queryByTestId('dev-sink-code')).not.toBeInTheDocument();
      expect((screen.getByLabelText('کد تأیید') as HTMLInputElement).value).toBe('');
    });
  });
});
