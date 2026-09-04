import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileForm } from './ProfileForm';
import type { MyProfileResponse } from '@taavon/contracts';

const originalFetch = global.fetch;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const EMPTY_PROFILE: MyProfileResponse = {
  userId: '11111111-1111-4111-8111-111111111111',
  hasProfile: false,
  username: null,
  displayName: null,
  bio: null,
  phoneVisibility: 'PRIVATE',
};

const EXISTING_PROFILE: MyProfileResponse = {
  userId: '11111111-1111-4111-8111-111111111111',
  hasProfile: true,
  username: 'ali_2000',
  displayName: 'علی',
  bio: 'سلام دنیا',
  phoneVisibility: 'PRIVATE',
};

describe('ProfileForm', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('starts empty for a user with no profile yet', () => {
    render(<ProfileForm profile={EMPTY_PROFILE} />);
    expect((screen.getByLabelText('نام کاربری') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('نام نمایشی') as HTMLInputElement).value).toBe('');
  });

  it('pre-fills fields from an existing profile', () => {
    render(<ProfileForm profile={EXISTING_PROFILE} />);
    expect((screen.getByLabelText('نام کاربری') as HTMLInputElement).value).toBe('ali_2000');
    expect((screen.getByLabelText('نام نمایشی') as HTMLInputElement).value).toBe('علی');
    expect((screen.getByLabelText('بیوگرافی') as HTMLTextAreaElement).value).toBe('سلام دنیا');
  });

  it('shows a character counter for bio capped at 320', () => {
    render(<ProfileForm profile={EMPTY_PROFILE} />);
    expect(screen.getByText('۰ / ۳۲۰')).toBeInTheDocument();
  });

  it('renders an XSS-shaped bio as literal text, never executing it', () => {
    render(<ProfileForm profile={{ ...EXISTING_PROFILE, bio: '<img src=x onerror=alert(1)>' }} />);
    expect((screen.getByLabelText('بیوگرافی') as HTMLTextAreaElement).value).toBe('<img src=x onerror=alert(1)>');
    expect(document.querySelector('img[onerror]')).toBeNull();
  });

  it('submits the four allow-listed fields via PATCH and shows a success message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ...EMPTY_PROFILE, hasProfile: true, username: 'ali_2000', displayName: 'علی' }));
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<ProfileForm profile={EMPTY_PROFILE} />);
    await userEvent.type(screen.getByLabelText('نام کاربری'), 'ali_2000');
    await userEvent.type(screen.getByLabelText('نام نمایشی'), 'علی');
    await userEvent.click(screen.getByRole('button', { name: /ذخیره/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/me/profile');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({
      username: 'ali_2000',
      displayName: 'علی',
      bio: '',
      phoneVisibility: 'PRIVATE',
    });

    expect(await screen.findByRole('status')).toHaveTextContent('ذخیره شد');
  });

  it('shows the server error message for a taken username', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(409, { error: { code: 'USERNAME_TAKEN', message: 'این نام کاربری قبلاً گرفته شده است.', correlationId: 'r1', details: [] } })
    ) as unknown as typeof fetch;

    render(<ProfileForm profile={EMPTY_PROFILE} />);
    await userEvent.type(screen.getByLabelText('نام کاربری'), 'ali_2000');
    await userEvent.type(screen.getByLabelText('نام نمایشی'), 'علی');
    await userEvent.click(screen.getByRole('button', { name: /ذخیره/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('این نام کاربری قبلاً گرفته شده است.');
  });

  describe('making the phone number public', () => {
    it('requires a two-step confirmation before actually toggling to PUBLIC', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, EXISTING_PROFILE));
      global.fetch = fetchMock as unknown as typeof fetch;

      render(<ProfileForm profile={EXISTING_PROFILE} />);

      // First click only reveals the warning + confirm step - it must not
      // flip the underlying value or submit anything yet.
      await userEvent.click(screen.getByRole('button', { name: 'نمایش عمومی شماره' }));
      expect(screen.getByText(/شمارهٔ شما برای همه قابل مشاهده خواهد شد/)).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole('button', { name: 'بله، شماره را عمومی کن' }));
      await userEvent.click(screen.getByRole('button', { name: /ذخیره/ }));

      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(init.body as string).phoneVisibility).toBe('PUBLIC');
    });

    it('reverting to private needs no confirmation step', async () => {
      const publicProfile: MyProfileResponse = { ...EXISTING_PROFILE, phoneVisibility: 'PUBLIC' };
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, publicProfile));
      global.fetch = fetchMock as unknown as typeof fetch;

      render(<ProfileForm profile={publicProfile} />);
      await userEvent.click(screen.getByRole('button', { name: 'مخفی کردن شماره' }));
      await userEvent.click(screen.getByRole('button', { name: /ذخیره/ }));

      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(init.body as string).phoneVisibility).toBe('PRIVATE');
    });
  });
});
