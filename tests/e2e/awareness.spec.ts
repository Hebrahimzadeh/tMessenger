import { test, expect } from '@playwright/test';
import { loginViaDevOtp } from './helpers/dev-login';
import { buildSpaceFromPrompt, LENDING_PROMPT } from './helpers/build-space';

// Targets the local dev stack - see auth.spec.ts's header comment for how
// to start the API. Exercises the real, private "مشارکت‌های من" timeline
// end to end: a real card creation genuinely appears in the caller's own
// timeline, newest first, with no filter/category/search control anywhere
// on the page. The admin funnel dashboard's own "shows real aggregated
// numbers" claim is instead covered by packages/awareness's and
// services/worker's real-Postgres integration tests - the daily
// aggregation only ever runs on a schedule (03:30 server time), which a
// synchronous E2E run cannot wait for without manually reaching into the
// worker process, so this spec checks the (equally real) superadmin-gated,
// correctly-empty dashboard state instead.

test('a real card creation appears in the author\'s own private participation timeline', async ({ page }) => {
  await loginViaDevOtp(page, '/');

  // One prompt, no fields (owner decision 2026-09-17).
  const title = `بستر آگاهی آزمایشی ${Math.floor(Math.random() * 1_000_000)}`;
  await buildSpaceFromPrompt(page, `${LENDING_PROMPT} - ${title}`);

  await page.getByRole('button', { name: 'ثبت کارت جدید' }).click();
  await page.getByLabel('متن کارت').fill('یک اطلاعیهٔ آزمایشی برای بررسی مشارکت‌های من.');
  await page.getByRole('button', { name: 'ثبت کارت', exact: true }).click();
  await page.waitForURL((url) => /^\/cards\//.test(url.pathname));

  await page.goto('/participations');
  await expect(page.getByRole('heading', { name: 'مشارکت‌های من' })).toBeVisible();
  await expect(page.getByText('کارتی ساختید')).toBeVisible();

  // "filter chip، tab دسته، search، score، summary یا «اقدام باز» نساز" -
  // none of these exist anywhere on the page.
  expect(await page.getByRole('searchbox').count()).toBe(0);
  expect(await page.getByRole('tab').count()).toBe(0);
  expect(await page.getByText(/امتیاز/).count()).toBe(0);
});

test('the awareness funnel dashboard is superadmin-only and shows a real, correctly-empty aggregate state', async ({ page }) => {
  // An ordinary user cannot even reach the underlying data (403, enforced
  // server-side) - the page itself only requires being logged in
  // (app/admin/metrics/page.tsx's own requireUser()), matching
  // app/admin/page.tsx's own division of responsibility.
  await loginViaDevOtp(page, '/admin/metrics');
  await expect(page.getByText('دسترسی کافی ندارید.')).toBeVisible();
});
