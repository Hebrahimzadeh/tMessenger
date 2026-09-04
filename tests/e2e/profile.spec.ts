import { test, expect } from '@playwright/test';
import { loginViaDevOtp } from './helpers/dev-login';

test.describe('Profile', () => {
  test('sets up a profile, views it publicly (private by default), then makes the phone public via the two-step confirmation', async ({ page }) => {
    await loginViaDevOtp(page, '/profile');

    const username = `e2e_${Math.floor(Math.random() * 1_000_000)}`;
    await page.getByLabel('نام کاربری').fill(username);
    await page.getByLabel('نام نمایشی').fill('کاربر آزمایشی');
    await page.getByLabel('بیوگرافی').fill('این یک بیوگرافی آزمایشی است.');
    await page.getByRole('button', { name: /ذخیره/ }).click();
    await expect(page.getByRole('status')).toHaveText('ذخیره شد.');

    // Public view, unauthenticated in a fresh context, defaults to private (no phone).
    const publicPage = await page.context().browser()!.newPage();
    await publicPage.goto(`/u/${username}`);
    await expect(publicPage.getByRole('heading', { name: 'کاربر آزمایشی' })).toBeVisible();
    await expect(publicPage.getByText(`@${username}`)).toBeVisible();
    await expect(publicPage.getByText('این یک بیوگرافی آزمایشی است.')).toBeVisible();
    await expect(publicPage.getByText('شماره تماس')).toHaveCount(0);
    await publicPage.close();

    // Two-step confirmation to make the phone public.
    await page.getByRole('button', { name: 'نمایش عمومی شماره' }).click();
    await expect(page.getByText(/شمارهٔ شما برای همه قابل مشاهده خواهد شد/)).toBeVisible();
    await page.getByRole('button', { name: 'بله، شماره را عمومی کن' }).click();
    await page.getByRole('button', { name: /ذخیره/ }).click();
    await expect(page.getByRole('status')).toHaveText('ذخیره شد.');

    const publicPage2 = await page.context().browser()!.newPage();
    await publicPage2.goto(`/u/${username}`);
    await expect(publicPage2.getByText('شماره تماس')).toBeVisible();
    await publicPage2.close();
  });

  test('a reserved username is rejected with a clear error', async ({ page }) => {
    await loginViaDevOtp(page, '/profile');
    await page.getByLabel('نام کاربری').fill('admin');
    await page.getByLabel('نام نمایشی').fill('کاربر آزمایشی');
    await page.getByRole('button', { name: /ذخیره/ }).click();
    // getByRole('alert') alone also matches Next.js's own hidden route
    // announcer (#__next-route-announcer__) - scope to the one with text.
    await expect(page.getByRole('alert').filter({ hasText: 'قابل استفاده نیست' })).toBeVisible();
  });

  test('visiting a nonexistent public profile 404s', async ({ page }) => {
    const response = await page.goto('/u/nobody_has_this_username_xyz');
    expect(response?.status()).toBe(404);
  });

  test('the public profile page is reachable without a session', async ({ page }) => {
    // Sanity check on proxy.ts's own allow-list, from a real anonymous browser.
    await loginViaDevOtp(page, '/profile');
    const username = `e2e_${Math.floor(Math.random() * 1_000_000)}`;
    await page.getByLabel('نام کاربری').fill(username);
    await page.getByLabel('نام نمایشی').fill('کاربر عمومی');
    await page.getByRole('button', { name: /ذخیره/ }).click();
    await expect(page.getByRole('status')).toHaveText('ذخیره شد.');

    const anonymousContext = await page.context().browser()!.newContext();
    const anonymousPage = await anonymousContext.newPage();
    const response = await anonymousPage.goto(`/u/${username}`);
    expect(response?.ok()).toBe(true);
    await expect(anonymousPage).toHaveURL(new RegExp(`/u/${username}`));
    await anonymousContext.close();
  });
});
