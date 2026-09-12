import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

const originalFetch = global.fetch;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function importLoginFlow() {
  const mod = await import('./LoginFlow');
  return mod.LoginFlow;
}

/**
 * Routes by URL rather than by call order. The OTP step also probes
 * /auth/otp/_dev-sink (test deployments have no SMS gateway), so the
 * request/verify pair is no longer simply the first and second fetch.
 */
function routeFetch(handlers: { request: () => Response; verify: () => Response }) {
  return vi.fn().mockImplementation(async (url: string) => {
    if (url.includes('/auth/otp/_dev-sink')) return jsonResponse(200, { code: null });
    if (url.includes('/auth/otp/request')) return handlers.request();
    if (url.includes('/auth/otp/verify')) return handlers.verify();
    throw new Error(`unexpected fetch: ${url}`);
  }) as unknown as typeof fetch;
}

describe('LoginFlow', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('starts on the phone step', async () => {
    const LoginFlow = await importLoginFlow();
    render(<LoginFlow next="/chats" />);
    expect(screen.getByRole('button', { name: /دریافت کد/ })).toBeInTheDocument();
  });

  it('moves to the OTP step after a successful phone submission, then redirects to `next` on successful verify', async () => {
    global.fetch = routeFetch({
      request: () => jsonResponse(202, { challengeId: 'c1', expiresInSeconds: 300, termsVersion: 1, privacyVersion: 1 }),
      verify: () => jsonResponse(200, { userId: '11111111-1111-4111-8111-111111111111' }),
    });

    const LoginFlow = await importLoginFlow();
    render(<LoginFlow next="/chats/42" />);

    await userEvent.type(screen.getByLabelText('شماره موبایل'), '09121234567');
    await userEvent.click(screen.getByRole('button', { name: /دریافت کد/ }));

    expect(await screen.findByLabelText('کد تأیید')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('کد تأیید'), '123456');
    await userEvent.click(screen.getByRole('button', { name: /تأیید کد/ }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/chats/42'));
    expect(refreshMock).toHaveBeenCalled();
  });

  it('bounces back to the phone step with a notice when the legal version changed', async () => {
    global.fetch = routeFetch({
      request: () => jsonResponse(202, { challengeId: 'c1', expiresInSeconds: 300, termsVersion: 1, privacyVersion: 1 }),
      verify: () =>
        jsonResponse(422, {
          error: {
            code: 'LEGAL_VERSION_CHANGED',
            message: 'قوانین به‌روزرسانی شده است. لطفاً دوباره تلاش کنید.',
            correlationId: 'r1',
            details: [{ termsVersion: 2, privacyVersion: 1, termsUrl: 'https://x/terms', privacyUrl: 'https://x/privacy' }],
          },
        }),
    });

    const LoginFlow = await importLoginFlow();
    render(<LoginFlow next="/chats" />);

    await userEvent.type(screen.getByLabelText('شماره موبایل'), '09121234567');
    await userEvent.click(screen.getByRole('button', { name: /دریافت کد/ }));
    expect(await screen.findByLabelText('کد تأیید')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('کد تأیید'), '123456');
    await userEvent.click(screen.getByRole('button', { name: /تأیید کد/ }));

    expect(await screen.findByLabelText('شماره موبایل')).toBeInTheDocument();
    expect(screen.getByText('قوانین به‌روزرسانی شده است. لطفاً دوباره تلاش کنید.')).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
