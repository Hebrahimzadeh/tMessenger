import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminDashboard } from './AdminDashboard';

const originalFetch = global.fetch;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const USER_ID = '33333333-3333-4333-8333-333333333333';

describe('AdminDashboard', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('shows an access-denied message when the user lacks the SUPERADMIN role', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(403, { error: { code: 'FORBIDDEN', message: 'دسترسی کافی ندارید.', correlationId: 'r1', details: [] } })
    ) as unknown as typeof fetch;

    render(<AdminDashboard />);
    expect(await screen.findByText('دسترسی کافی ندارید.')).toBeInTheDocument();
  });

  it('shows the MFA challenge form when MFA_REQUIRED, then the real dashboard after a successful challenge', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(403, { error: { code: 'MFA_REQUIRED', message: 'برای این عملیات نیاز به تأیید دومرحله‌ای دارید.', correlationId: 'r1', details: [] } })
      )
      .mockResolvedValueOnce(jsonResponse(200, { ok: true })) // POST /auth/mfa/challenge
      .mockResolvedValueOnce(jsonResponse(200, { claims: [] })); // retried GET /admin/identity-claims
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AdminDashboard />);
    expect(await screen.findByLabelText('کد احراز دومرحله‌ای')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('کد احراز دومرحله‌ای'), '123456');
    await userEvent.click(screen.getByRole('button', { name: /تأیید/ }));

    expect(await screen.findByText('موردی برای بررسی وجود ندارد.')).toBeInTheDocument();
  });

  it('lists pending claims with verify/reject actions once authorized', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { claims: [{ userId: USER_ID, status: 'PENDING' }] })) as unknown as typeof fetch;

    render(<AdminDashboard />);
    expect(await screen.findByText(USER_ID)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تأیید مدرک' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'رد مدرک' })).toBeInTheDocument();
  });

  it('verifying a claim calls the verify endpoint and removes it from the list', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { claims: [{ userId: USER_ID, status: 'PENDING' }] }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true })); // POST verify
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AdminDashboard />);
    await screen.findByText(USER_ID);
    await userEvent.click(screen.getByRole('button', { name: 'تأیید مدرک' }));

    await waitFor(() => expect(screen.queryByText(USER_ID)).not.toBeInTheDocument());
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toContain(`/admin/identity-claims/${USER_ID}/verify`);
    expect(JSON.parse(init.body as string)).toEqual({ decision: 'VERIFIED' });
  });

  it('assigns a role via the form and shows a success message', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { claims: [] }))
      .mockResolvedValueOnce(jsonResponse(200, { created: true }));
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AdminDashboard />);
    await screen.findByText('موردی برای بررسی وجود ندارد.');

    await userEvent.type(screen.getByLabelText('شناسهٔ کاربر'), USER_ID);
    await userEvent.selectOptions(screen.getByLabelText('نقش'), 'MODERATOR');
    await userEvent.click(screen.getByRole('button', { name: 'اعطای نقش' }));

    expect(await screen.findByText(/نقش با موفقیت اعطا شد/)).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toContain('/admin/role-assignments');
    expect(JSON.parse(init.body as string)).toEqual({ userId: USER_ID, role: 'MODERATOR' });
  });

  it('shows the server error when role assignment fails (e.g. unverified claim)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { claims: [] }))
      .mockResolvedValueOnce(
        jsonResponse(422, { error: { code: 'IDENTITY_CLAIM_NOT_VERIFIED', message: 'برای این نقش، تأیید مدرک هویت رسمی لازم است.', correlationId: 'r1', details: [] } })
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AdminDashboard />);
    await screen.findByText('موردی برای بررسی وجود ندارد.');

    await userEvent.type(screen.getByLabelText('شناسهٔ کاربر'), USER_ID);
    await userEvent.selectOptions(screen.getByLabelText('نقش'), 'SENIOR_ADMIN');
    await userEvent.click(screen.getByRole('button', { name: 'اعطای نقش' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('برای این نقش، تأیید مدرک هویت رسمی لازم است.');
  });
});
