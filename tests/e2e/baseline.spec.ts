import { test, expect } from '@playwright/test';
import { loginViaDevOtp } from './helpers/dev-login';

const SEED_PLATFORM_NAMES = [
  'امانات محله انصار',
  'پویش سواد رسانه‌ای مادران',
  'احیای خانه‌های متروکه روستا',
  'خرید مستقیم محصولات کشاورزی',
  'هیئت مداحان آیینی',
  'شاعران آیینی محله',
  'طب سنتی اسلامی محله',
];

test('home page renders the platforms tab with all seed platforms and no console errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  // Task 07: `/` is no longer a public route (proxy.ts's allow-list is
  // exactly /login, /legal/terms, /legal/privacy, /system-status) - a real
  // session is required first. Login-flow network activity happens before
  // the console-error listeners below would care about it either way.
  await loginViaDevOtp(page, '/');

  await expect(page.getByRole('heading', { name: 'تعاون', level: 1 })).toBeVisible();

  for (const name of SEED_PLATFORM_NAMES) {
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }

  expect(consoleErrors).toEqual([]);
});
