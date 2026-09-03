import { test, expect } from '@playwright/test';
import { randomIranianPhone } from './helpers/dev-login';

// Targets the local dev stack: playwright.config.ts's webServer starts the
// Next.js dev server automatically, but the API is a separate process -
// start it yourself first (npx tsx services/api/src/server.ts against a
// real Postgres/Redis, e.g. `docker compose up -d postgres redis`) matching
// this task's own dev-login requirement ("E2E ورود dev").
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/v1';

async function getDevOtpCode(phoneE164: string): Promise<string> {
  const response = await fetch(`${API_BASE}/auth/otp/_dev-sink?phone=${encodeURIComponent(phoneE164)}`);
  const body = (await response.json()) as { code: string | null };
  if (!body.code) {
    throw new Error(`No dev-sink OTP code found for ${phoneE164} - is the API running with NODE_ENV != production?`);
  }
  return body.code;
}

test.describe('proxy: route protection', () => {
  test('redirects an anonymous visit to a protected route to /login with an internal, allow-listed next param', async ({ page }) => {
    await page.goto('/chats');
    await expect(page).toHaveURL(/\/login\?next=%2Fchats/);
  });

  test('never redirects a visit to a public route', async ({ page }) => {
    const response = await page.goto('/system-status');
    expect(response?.ok()).toBe(true);
    await expect(page).toHaveURL(/system-status/);
  });
});

test.describe('OTP login', () => {
  test('shows the acceptance text with working links before any code is requested', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByTestId('acceptance-text')).toContainText('پذیرش قوانین و مقررات و حریم خصوصی جامعهٔ تعاون‌آفرینی است');

    await page.getByRole('link', { name: 'قوانین و مقررات' }).click();
    await expect(page).toHaveURL(/\/legal\/terms/);
  });

  test('logs in with a dev OTP, persists the session across navigation, then refresh and logout both work', async ({ page, context }) => {
    const { national, e164 } = randomIranianPhone();

    // Deliberately not /system-status as the `next` target: that string
    // would also appear in this very login URL's own query string
    // (?next=%2Fsystem-status), making a substring URL assertion below
    // pass falsely early while still on the login page. /chats has no such
    // collision.
    await page.goto('/login?next=%2Fchats');
    await page.getByLabel('شماره موبایل').fill(national);
    await page.getByRole('button', { name: /دریافت کد/ }).click();

    await expect(page.getByLabel('کد تأیید')).toBeVisible();
    const code = await getDevOtpCode(e164);
    await page.getByLabel('کد تأیید').fill(code);
    await page.getByRole('button', { name: /تأیید کد/ }).click();

    // Redirected to the sanitized `next` target after a successful verify.
    await expect(page).toHaveURL(/\/chats$/);

    // Session cookies exist, are HttpOnly (access/refresh) or not (csrf),
    // and nothing auth-related ever touches localStorage.
    const cookies = await context.cookies();
    const accessCookie = cookies.find((c) => c.name === 'access_token');
    const refreshCookie = cookies.find((c) => c.name === 'refresh_token');
    const csrfCookie = cookies.find((c) => c.name === 'csrf_token');
    expect(accessCookie?.httpOnly).toBe(true);
    expect(refreshCookie?.httpOnly).toBe(true);
    expect(csrfCookie?.httpOnly).toBe(false);

    const localStorageDump = await page.evaluate(() => JSON.stringify(localStorage));
    expect(localStorageDump).not.toMatch(/[0-9]{6}/); // no 6-digit OTP code anywhere
    expect(localStorageDump.toLowerCase()).not.toContain('token');

    // Persistence: a previously-protected route no longer redirects to /login.
    await page.goto('/chats');
    await expect(page).not.toHaveURL(/login/);

    // Refresh: call the endpoint directly (no UI trigger exists yet - Task
    // 07 has no account menu) with the CSRF header the API client would
    // normally attach, and confirm it actually rotates the refresh cookie.
    const refreshResponse = await page.request.post(`${API_BASE}/auth/refresh`, {
      headers: { 'x-csrf-token': csrfCookie!.value },
    });
    expect(refreshResponse.ok()).toBe(true);
    const cookiesAfterRefresh = await context.cookies();
    const rotatedRefreshCookie = cookiesAfterRefresh.find((c) => c.name === 'refresh_token');
    expect(rotatedRefreshCookie?.value).not.toBe(refreshCookie?.value);

    // Logout: clears the session server-side; the protected route redirects again.
    await page.request.post(`${API_BASE}/auth/logout`);
    await page.goto('/chats');
    await expect(page).toHaveURL(/login/);
  });

  test('shows an accessible error for an incorrect code and does not advance', async ({ page }) => {
    const { national } = randomIranianPhone();

    await page.goto('/login');
    await page.getByLabel('شماره موبایل').fill(national);
    await page.getByRole('button', { name: /دریافت کد/ }).click();
    await expect(page.getByLabel('کد تأیید')).toBeVisible();

    await page.getByLabel('کد تأیید').fill('000000');
    await page.getByRole('button', { name: /تأیید کد/ }).click();

    // getByRole('alert') alone also matches Next.js's own hidden route
    // announcer (#__next-route-announcer__), which also carries role="alert" -
    // scope to the one that actually has text.
    await expect(page.getByRole('alert').filter({ hasText: 'نادرست' })).toBeVisible();
  });
});
