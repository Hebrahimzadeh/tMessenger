import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MfaChallengeForm } from './MfaChallengeForm';

const originalFetch = global.fetch;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('MfaChallengeForm', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('calls onVerified after a successful challenge', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true })) as unknown as typeof fetch;
    const onVerified = vi.fn();

    render(<MfaChallengeForm onVerified={onVerified} />);
    await userEvent.type(screen.getByLabelText('کد احراز دومرحله‌ای'), '123456');
    await userEvent.click(screen.getByRole('button', { name: /تأیید/ }));

    await waitFor(() => expect(onVerified).toHaveBeenCalled());
  });

  it('shows the server error and does not call onVerified for an incorrect code', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(422, { error: { code: 'MFA_INVALID_CODE', message: 'کد وارد شده نادرست است.', correlationId: 'r1', details: [] } })
    ) as unknown as typeof fetch;
    const onVerified = vi.fn();

    render(<MfaChallengeForm onVerified={onVerified} />);
    await userEvent.type(screen.getByLabelText('کد احراز دومرحله‌ای'), '000000');
    await userEvent.click(screen.getByRole('button', { name: /تأیید/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('کد وارد شده نادرست است.');
    expect(onVerified).not.toHaveBeenCalled();
  });
});
