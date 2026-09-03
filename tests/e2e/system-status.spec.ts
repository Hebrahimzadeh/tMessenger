import { test, expect } from '@playwright/test';

// Targets the docker-compose stack (proxy -> web/api), not the local dev
// server: run `docker compose up -d` first, matching this task's mandatory
// test command. Independent of playwright.config.ts's webServer/baseURL,
// which is for baseline.spec.ts's local-dev workflow instead.
const baseURL = process.env.SYSTEM_STATUS_BASE_URL ?? 'http://localhost';

test('home page loads through the reverse proxy', async ({ page }) => {
  const response = await page.goto(`${baseURL}/`);
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole('heading', { name: 'تعاون', level: 1 })).toBeVisible();
});

test('system-status page reports all dependencies healthy through the full compose stack', async ({ page }) => {
  await page.goto(`${baseURL}/system-status`);

  await expect(page.getByText('وضعیت کلی: سالم')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('پایگاه‌داده')).toBeVisible();
  await expect(page.getByText('صف/کش (Redis)')).toBeVisible();
  await expect(page.getByText('ذخیره‌سازی فایل')).toBeVisible();
  // The overall-status line plus all three per-check labels read "سالم".
  await expect(page.getByText('سالم', { exact: true })).toHaveCount(3);
});

test('API is reachable through the /api/* proxy path with the /api prefix stripped', async ({ request }) => {
  const response = await request.get(`${baseURL}/api/v1/health/live`);
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body.status).toBe('ok');
});
