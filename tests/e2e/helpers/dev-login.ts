import type { Page } from '@playwright/test';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/v1';

async function getDevOtpCode(phoneE164: string): Promise<string> {
  const response = await fetch(`${API_BASE}/auth/otp/_dev-sink?phone=${encodeURIComponent(phoneE164)}`);
  const body = (await response.json()) as { code: string | null };
  if (!body.code) {
    throw new Error(`No dev-sink OTP code found for ${phoneE164} - is the API running with NODE_ENV != production?`);
  }
  return body.code;
}

export function randomIranianPhone(): { national: string; e164: string } {
  const suffix = Math.floor(1_000_000 + Math.random() * 8_999_999).toString();
  return { national: `0912${suffix}`, e164: `+98912${suffix}` };
}

/**
 * Logs the given page in via the real dev OTP flow (Task 07's proxy.ts now
 * gates every route except /login, /legal/terms, /legal/privacy and
 * /system-status - most existing E2E specs need a real session first).
 * Requires the API running with NODE_ENV != production (the dev sink
 * provider) against real Postgres/Redis - see tests/e2e/auth.spec.ts's own
 * header comment for how to start it.
 */
export async function loginViaDevOtp(page: Page, next = '/'): Promise<void> {
  const { national, e164 } = randomIranianPhone();

  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('شماره موبایل').fill(national);
  await page.getByRole('button', { name: /دریافت کد/ }).click();

  await page.getByLabel('کد تأیید').waitFor({ state: 'visible' });
  const code = await getDevOtpCode(e164);
  await page.getByLabel('کد تأیید').fill(code);
  await page.getByRole('button', { name: /تأیید کد/ }).click();
  await page.waitForURL((url) => url.pathname === next);
}
