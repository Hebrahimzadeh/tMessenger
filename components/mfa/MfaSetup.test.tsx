import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MfaSetup } from './MfaSetup';

const originalFetch = global.fetch;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('MfaSetup', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('starts with an "enroll" button and calls POST /auth/mfa/enroll when clicked', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { secretBase32: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/Taavon-Afarini:user-1?secret=JBSWY3DPEHPK3PXP' })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<MfaSetup />);
    await userEvent.click(screen.getByRole('button', { name: /شروع فعال‌سازی/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/auth/mfa/enroll');
    expect(init.method).toBe('POST');

    expect(await screen.findByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
    expect(screen.getByLabelText('کد شش‌رقمی')).toBeInTheDocument();
  });

  it('confirms with a code and shows the 10 recovery codes exactly once', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { secretBase32: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/x' }))
      .mockResolvedValueOnce(
        jsonResponse(200, { recoveryCodes: Array.from({ length: 10 }, (_, i) => `CODE-${i}` ) })
      ) as unknown as typeof fetch;

    render(<MfaSetup />);
    await userEvent.click(screen.getByRole('button', { name: /شروع فعال‌سازی/ }));
    await screen.findByLabelText('کد شش‌رقمی');

    await userEvent.type(screen.getByLabelText('کد شش‌رقمی'), '123456');
    await userEvent.click(screen.getByRole('button', { name: /تأیید/ }));

    expect(await screen.findByText('CODE-0')).toBeInTheDocument();
    expect(screen.getByText('CODE-9')).toBeInTheDocument();
    expect(screen.getByText(/این کدها را فقط یک‌بار می‌بینید/)).toBeInTheDocument();
  });

  it('shows the server error message for an incorrect confirmation code', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { secretBase32: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/x' }))
      .mockResolvedValueOnce(
        jsonResponse(422, { error: { code: 'MFA_INVALID_CODE', message: 'کد وارد شده نادرست است.', correlationId: 'r1', details: [] } })
      ) as unknown as typeof fetch;

    render(<MfaSetup />);
    await userEvent.click(screen.getByRole('button', { name: /شروع فعال‌سازی/ }));
    await screen.findByLabelText('کد شش‌رقمی');

    await userEvent.type(screen.getByLabelText('کد شش‌رقمی'), '000000');
    await userEvent.click(screen.getByRole('button', { name: /تأیید/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('کد وارد شده نادرست است.');
  });
});
