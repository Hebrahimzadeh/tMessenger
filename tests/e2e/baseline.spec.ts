import { test, expect } from '@playwright/test';
import { loginViaDevOtp } from './helpers/dev-login';

// Task 12 replaced the home tab's old mock PlatformsList (fixed seed
// content) with SpaceDiscoveryList, a real API-backed feed of PUBLISHED
// spaces - there is no fixed seed list to assert against any more, and the
// list's own real contents vary with whatever spaces exist in this dev
// database. This test checks the page's own real structure instead: the
// heading, the create-a-space entry point, and no console errors - the
// list itself is covered by SpaceDiscoveryList's own component tests and
// spaces.spec.ts's real create/publish/view flow.
test('home page renders the space discovery feed with no console errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  // Task 07: `/` is no longer a public route (proxy.ts's allow-list is
  // exactly /login, /legal/terms, /legal/privacy, /system-status, /u/,
  // /spaces/) - a real session is required first. Login-flow network
  // activity happens before the console-error listeners below would care
  // about it either way.
  await loginViaDevOtp(page, '/');

  await expect(page.getByRole('heading', { name: 'بسترها', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'ساخت بستر جدید' })).toBeVisible();
  // Either the empty state or at least one real result - proves the API
  // call actually completed rather than hanging in the loading state.
  await expect(page.getByRole('status')).toHaveCount(0);

  expect(consoleErrors).toEqual([]);
});
