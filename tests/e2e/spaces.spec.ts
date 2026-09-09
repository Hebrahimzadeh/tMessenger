import { test, expect } from '@playwright/test';
import { loginViaDevOtp } from './helpers/dev-login';

// Targets the local dev stack - see auth.spec.ts's header comment for how
// to start the API. Each test logs in as its own fresh, randomly-generated
// user (loginViaDevOtp), so these can run in parallel unlike admin.spec.ts's
// fixed-superadmin-phone tests.

test('creates and publishes a space through the full wizard, then the public page shows it correctly', async ({ page, context }) => {
  await loginViaDevOtp(page, '/spaces/new');

  const title = `باغ محله آزمایشی ${Math.floor(Math.random() * 1_000_000)}`;
  await page.getByLabel('عنوان بستر').fill(title);
  await page
    .getByLabel('این بستر برای چیست؟')
    .fill('این بستر برای هماهنگی داوطلبانه‌ی نگهداری باغچه‌ی محله تشکیل شده است.');
  await page.getByRole('button', { name: 'ادامه' }).click();

  await expect(page.getByLabel('نقش اصلی اول')).toBeVisible();
  await page.getByLabel('روش‌های مشارکت (با ویرگول جدا کنید)').fill('حضوری');
  await page.getByRole('button', { name: 'ادامه' }).click();

  await expect(page.getByText('این بستر آمادهٔ انتشار است.')).toBeVisible();
  await page.getByRole('button', { name: 'انتشار' }).click();

  await expect(page.getByText('بستر شما منتشر شد!')).toBeVisible();
  const spaceLink = page.getByRole('link', { name: 'مشاهدهٔ بستر' });
  const href = await spaceLink.getAttribute('href');
  expect(href).toMatch(/^\/spaces\//);

  // As the owner: the health panel is visible (creator/admin only, per
  // Task 13's own "endpoint health فقط creator/admin") and shows the
  // real, freshly-computed NEW status - no snapshot existed yet (the
  // worker hasn't run), so this also confirms getSpaceHealth's on-demand
  // compute-and-store fallback actually works end to end, not just its
  // unit tests.
  await spaceLink.click();
  await expect(page.getByText('سلامت بستر')).toBeVisible();
  await expect(page.getByText('جدید')).toBeVisible();

  // The public page, from a completely separate, anonymous browser context.
  // `href` holds the raw (non-percent-encoded) Persian slug, exactly as
  // Next.js's <Link> renders it - a real click normalizes this the same
  // way any <a href> with a Unicode path does, but page.goto() takes the
  // string more literally, so build a properly percent-encoded URL first
  // (the WHATWG URL constructor does this per spec) rather than passing
  // the raw path straight through.
  const anonPage = await (await context.browser()!.newContext()).newPage();
  await anonPage.goto(new URL(href!, page.url()).toString());
  await expect(anonPage.getByRole('heading', { name: title })).toBeVisible();
  await expect(anonPage.getByText('سازمان‌دهنده')).toBeVisible();
  await expect(anonPage.getByText('همکار')).toBeVisible();
  await expect(anonPage.getByRole('button', { name: 'دنبال کردن' })).toBeVisible();
});

test('a REVISE precheck shows the specific, editable reason and lets the user fix it in place', async ({ page }) => {
  await loginViaDevOtp(page, '/spaces/new');

  await page.getByLabel('عنوان بستر').fill(`بستر ناقص ${Math.floor(Math.random() * 1_000_000)}`);
  await page.getByLabel('این بستر برای چیست؟').fill('کوتاه'); // shorter than the gate's 20-char minimum
  await page.getByRole('button', { name: 'ادامه' }).click();

  await expect(page.getByLabel('نقش اصلی اول')).toBeVisible();
  await page.getByRole('button', { name: 'ادامه' }).click();

  await expect(page.getByText(/توضیح هدف را کامل‌تر بنویسید/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'انتشار' })).toHaveCount(0);

  await page.getByRole('button', { name: 'بازگشت و ویرایش' }).click();
  await expect(page.getByLabel('نقش اصلی اول')).toBeVisible();
});

test('an old /platforms/:id link redirects home instead of 404ing', async ({ page }) => {
  // /platforms/:id was already behind login before this task (proxy.ts's
  // allow-list never included it) - the realistic scenario is an existing
  // logged-in user following an old bookmark, not an anonymous visit.
  await loginViaDevOtp(page, '/');
  await page.goto('/platforms/1');
  await expect(page).toHaveURL((url) => url.pathname === '/');
});

test('an anonymous visit to /spaces/new still redirects to login - the proxy treats /spaces/ as public only for its own cheap check, requireUser() is the real gate', async ({
  page,
}) => {
  await page.goto('/spaces/new');
  await expect(page).toHaveURL((url) => url.pathname === '/login');
});
