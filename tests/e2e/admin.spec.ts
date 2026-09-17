import { execSync } from 'node:child_process';
import { test, expect, type Page } from '@playwright/test';
import { computeTotpCode } from '../../services/api/src/modules/auth/totp';
import { loginViaDevOtp } from './helpers/dev-login';

// Targets the local dev stack - see auth.spec.ts's header comment for how
// to start the API. Additionally requires BOOTSTRAP_SUPERADMIN_PHONE set in
// .env (Task 05) and `npm run bootstrap:superadmin` runnable from the repo
// root (this spec runs it directly - idempotent, so re-running this spec
// is safe).
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/v1';
const SUPERADMIN_PHONE_E164 = process.env.BOOTSTRAP_SUPERADMIN_PHONE ?? '+989191953219';

async function getDevOtpCode(phoneE164: string): Promise<string> {
  const response = await fetch(`${API_BASE}/auth/otp/_dev-sink?phone=${encodeURIComponent(phoneE164)}`);
  const body = (await response.json()) as { code: string | null };
  if (!body.code) {
    throw new Error(`No dev-sink OTP code found for ${phoneE164} - is the API running with NODE_ENV != production?`);
  }
  return body.code;
}

async function loginAsSuperadmin(page: Page): Promise<void> {
  await page.goto('/login?next=%2Fadmin');
  // The phone form accepts an already-E.164 value directly regardless of
  // the selected country - normalizePhone resolves the country from the
  // '+' prefix itself.
  await page.getByLabel('شماره موبایل').fill(SUPERADMIN_PHONE_E164);
  await page.getByRole('button', { name: /دریافت کد/ }).click();
  await page.getByLabel('کد تأیید').waitFor({ state: 'visible' });
  const code = await getDevOtpCode(SUPERADMIN_PHONE_E164);
  await page.getByLabel('کد تأیید').fill(code);
  await page.getByRole('button', { name: /تأیید کد/ }).click();
  await page.waitForURL((url) => url.pathname === '/admin');
}

// Serial, not parallel: every test in this block logs in as the *same*
// bootstrap superadmin phone number. Running them in parallel (Playwright's
// default) races multiple /auth/otp/request calls for that one phone
// against each other - the dev-sink only remembers the *last* code sent,
// so a concurrent test's request can overwrite the code this test is about
// to read, making verify fail against a stale code (observed directly:
// this caused a genuine 30s hang before switching to .serial()).
test.describe.serial('Superadmin: bootstrap, MFA, and moderator appointment', () => {
  test.beforeAll(() => {
    // Idempotent (Task 05) - safe even if a prior run (or Task 05's own
    // verification) already bootstrapped this exact phone number.
    execSync('npm run bootstrap:superadmin', { stdio: 'pipe' });

    // Clean up in beforeAll, not only after: an interrupted run leaves a
    // PENDING TOTP enrollment behind and every later run then gets "برای
    // بازنشانی احراز دومرحله‌ای، ابتدا آن را تأیید کنید" instead of a fresh
    // secret - permanently, until somebody clears the row by hand. Same
    // remedy space-search.repository.test.ts got in Task 19.
    execSync('npx tsx tests/e2e/helpers/reset-superadmin-mfa.mjs', { stdio: 'pipe' });
  });

  test('the bootstrap superadmin cannot use /admin without completing MFA, even right after logging in', async ({ page }) => {
    await loginAsSuperadmin(page);
    // requireRole rejects with MFA_REQUIRED until a challenge is completed -
    // AdminDashboard shows the challenge form plus a link to enroll,
    // instead of the real admin content. The gate's own GET call is async,
    // so wait for it rather than checking .isVisible() once immediately
    // (which can catch the component still in its initial "loading" state
    // - this is exactly what happened before this test awaited properly).
    await expect(page.getByLabel('کد احراز دومرحله‌ای')).toBeVisible();
    await expect(page.getByRole('link', { name: 'از اینجا فعال کنید' })).toBeVisible();
    await expect(page.getByText('پیشخوان مدیریت')).toHaveCount(0);
  });

  test('full flow: enroll MFA, submit+verify an identity claim, and appoint a moderator', async ({ page, context }) => {
    await loginAsSuperadmin(page);

    // --- Enroll MFA (idempotent-ish: re-enrolling while PENDING is allowed) ---
    await page.goto('/settings/security');
    await page.getByRole('button', { name: /شروع فعال‌سازی/ }).click();
    const secretBase32 = await page.getByTestId('mfa-secret').innerText();
    await page.getByLabel('کد شش‌رقمی').fill(computeTotpCode(secretBase32));
    await page.getByRole('button', { name: /تأیید/ }).click();
    await expect(page.getByText(/این کدها را فقط یک‌بار می‌بینید/)).toBeVisible();

    // --- A separate user submits an identity claim in a fresh, anonymous context ---
    const targetContext = await context.browser()!.newContext();
    const targetPage = await targetContext.newPage();
    await loginViaDevOtp(targetPage, '/profile');
    // Set up a minimal profile so the target user has a real identity to reference.
    await targetPage.getByLabel('نام کاربری').fill(`mod_${Math.floor(Math.random() * 1_000_000)}`);
    await targetPage.getByLabel('نام نمایشی').fill('ناظر آزمایشی');
    await targetPage.getByRole('button', { name: /ذخیره/ }).click();
    await expect(targetPage.getByRole('status')).toHaveText('ذخیره شد.');

    const meResponse = await targetPage.request.get(`${API_BASE}/me`);
    const { userId: targetUserId } = (await meResponse.json()) as { userId: string };

    const claimResponse = await targetPage.request.post(`${API_BASE}/me/identity-claim`, {
      data: { evidence: 'من ناظر رسمی این پلتفرم هستم و این مدرک آزمایشی من است.' },
    });
    expect(claimResponse.ok()).toBe(true);
    await targetContext.close();

    // --- Superadmin (now MFA-verified) reviews and appoints the moderator ---
    await page.goto('/admin');
    await expect(page.getByText(targetUserId)).toBeVisible();
    await page.getByRole('button', { name: 'تأیید مدرک' }).click();
    await expect(page.getByText(targetUserId)).toHaveCount(0);

    await page.getByLabel('شناسهٔ کاربر').fill(targetUserId);
    await page.getByLabel('نقش').selectOption('MODERATOR');
    await page.getByRole('button', { name: 'اعطای نقش' }).click();
    await expect(page.getByText(/نقش با موفقیت اعطا شد/)).toBeVisible();
  });

  test('an ordinary user (no elevated role) is denied access to the admin dashboard', async ({ page }) => {
    // Proves requireRole('SUPERADMIN') actually rejects a plain, unprivileged
    // user - the same invariant the previous test's MODERATOR would also
    // satisfy (MODERATOR != SUPERADMIN), demonstrated here with a fresh,
    // never-privileged account instead of depending on that test's state.
    await loginViaDevOtp(page, '/admin');
    await expect(page.getByText('دسترسی کافی ندارید.')).toBeVisible();
  });
});
