import { test, expect } from '@playwright/test';
import { loginViaDevOtp } from './helpers/dev-login';
import { buildSpaceFromPrompt, LENDING_PROMPT } from './helpers/build-space';
import { openSpaceInfo } from './helpers/space-info';

// Targets the local dev stack - see auth.spec.ts's header comment for how to
// start the API. Each test logs in as its own fresh, randomly-generated user
// (loginViaDevOtp), so these run in parallel.
//
// Spaces are made from one prompt (owner decision, 2026-09-17): no title
// field, no purpose field, no roles form and no review panel. The AI designs
// the whole space from the prompt and the space-builder document, the policy
// baseline decides whether it may exist, and the person lands on their space
// as its manager.

test('one prompt builds a whole space, publishes it, and the public page shows it', async ({ page, context }) => {
  await loginViaDevOtp(page, '/');
  const spaceUrl = await buildSpaceFromPrompt(page, `${LENDING_PROMPT} - آزمایشی ${Math.floor(Math.random() * 1_000_000)}`);

  await expect(page.getByRole('status').filter({ hasText: 'ساخته و منتشر شد' })).toBeVisible();

  // The space is a conversation: its name in the toolbar, one search
  // box, the feed, and the tool that makes a card. Nothing else.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByLabel('جستجو در بستر')).toBeVisible();
  await expect(page.getByRole('button', { name: 'ایجاد درخواست یا کارت جدید...' })).toBeVisible();

  await openSpaceInfo(page);
  // A real description written about the space, not the prompt pasted back.
  await expect(page.getByText(/بستری است برای|این بستر/)).toBeVisible();
  // Two primary roles, which is what publishing requires.
  await expect(page.getByText('اصلی').first()).toBeVisible();
  expect(await page.getByText('اصلی').count()).toBe(2);
  await page.getByRole('button', { name: 'بستن' }).click();

  // The owner-only health panel, computed on demand.
  await openSpaceInfo(page, 'manage');
  await expect(page.getByText('سلامت بستر')).toBeVisible();
  await expect(page.getByRole('button', { name: 'ویرایش بستر' })).toBeVisible();
  await page.getByRole('button', { name: 'بستن' }).click();

  // The public page, from a completely separate, anonymous browser context.
  const anonPage = await (await context.browser()!.newContext()).newPage();
  await anonPage.goto(spaceUrl);
  await expect(anonPage.getByRole('heading', { level: 1 })).toBeVisible();
  // Someone who has not joined is asked to, where a member writes cards.
  await expect(anonPage.getByRole('button', { name: 'عضویت در این بستر' })).toBeVisible();
  // Managing belongs to the manager, not to a visitor - the gear is not there at all.
  await expect(anonPage.getByRole('button', { name: 'مدیریت بستر' })).toHaveCount(0);
});

test('a vague prompt still becomes a complete space rather than a form', async ({ page }) => {
  await loginViaDevOtp(page, '/');
  await buildSpaceFromPrompt(page, `یه کار خوب برای محله ${Math.floor(Math.random() * 1_000_000)}`);

  // No field was ever asked for, and the space exists anyway.
  await expect(page.getByRole('status').filter({ hasText: 'ساخته و منتشر شد' })).toBeVisible();
  await openSpaceInfo(page);
  await expect(page.getByText('نقش‌ها')).toBeVisible();
  expect(await page.getByText('اصلی').count()).toBe(2);
});

test('the composer asks for nothing but the prompt', async ({ page }) => {
  await loginViaDevOtp(page, '/spaces/new');

  await expect(page.getByLabel('چه بستری می‌خواهید؟')).toBeVisible();
  for (const gone of ['عنوان بستر', 'این بستر برای چیست؟', 'نقش اصلی اول', 'روش‌های مشارکت (با ویرگول جدا کنید)']) {
    await expect(page.getByLabel(gone)).toHaveCount(0);
  }
});

test('a forbidden prompt builds nothing and says which rule', async ({ page }) => {
  await loginViaDevOtp(page, '/spaces/new');

  const prompt = 'بستری برای شرط‌بندی روی نتیجهٔ بازی‌های محله با جایزهٔ نقدی';
  await page.getByLabel('چه بستری می‌خواهید؟').fill(prompt);
  await page.getByRole('button', { name: 'ساخت بستر' }).click();

  await expect(page.getByRole('alert')).toContainText('بستری ساخته نشد');
  await expect(page.getByText(/gambling@v1/)).toBeVisible();
  await expect(page.getByText(/قانون مجازات اسلامی/)).toBeVisible();
  // Still on the composer, with their words intact to rewrite.
  await expect(page).toHaveURL(/\/spaces\/new$/);
  await expect(page.getByLabel('چه بستری می‌خواهید؟')).toHaveValue(prompt);
});

test('a flagged-but-not-banned prompt builds a space held for a person, visible only to them', async ({ page, context }) => {
  await loginViaDevOtp(page, '/');
  const spaceUrl = await buildSpaceFromPrompt(page, `صندوق محله با سود تضمینی ماهانه ${Math.floor(Math.random() * 1_000_000)}`);

  await expect(page.getByRole('status').filter({ hasText: 'پس از نگاه یک نفر منتشر می‌شود' })).toBeVisible();
  // The lock badge a space wears in its own toolbar until it is published.
  await expect(page.getByText('در انتظار بررسی')).toBeVisible();

  // Not public until someone looks.
  const anonPage = await (await context.browser()!.newContext()).newPage();
  await anonPage.goto(spaceUrl);
  await expect(anonPage.getByText('این بستر یافت نشد.')).toBeVisible();
});

test('an outage builds a space that waits for a person rather than publishing', async ({ page }) => {
  // The server half is unit-tested (a broken, empty or hanging baseline never
  // publishes). What only a browser shows is what the person then sees, so the
  // response the API actually produces in that case is replayed here.
  await page.route('**/v1/spaces/build', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        outcome: 'HUMAN_REVIEW',
        space: { id: '00000000-0000-4000-8000-000000000001', slug: 'does-not-matter' },
        reason: 'بررسی خودکار قواعد در دسترس نبود، بنابراین بستر پس از نگاه یک نفر منتشر می‌شود.',
        matchedPolicyRules: [],
        policyVersionRef: 'unavailable',
        creativityApplied: false,
      }),
    });
  });

  await loginViaDevOtp(page, '/spaces/new');
  await page.getByLabel('چه بستری می‌خواهید؟').fill(LENDING_PROMPT);
  await page.getByRole('button', { name: 'ساخت بستر' }).click();

  // It leaves the composer for the space, which is the "shown to the person"
  // half; the space itself 404s here because the id is invented.
  await page.waitForURL((url) => url.searchParams.get('built') === 'review', { timeout: 30_000 });
});

test('the manager edits the space after publication, and a refused edit changes nothing public', async ({ page }) => {
  await loginViaDevOtp(page, '/');
  await buildSpaceFromPrompt(page, `${LENDING_PROMPT} - ویرایش ${Math.floor(Math.random() * 1_000_000)}`);

  const original = await page.getByRole('heading', { level: 1 }).innerText();

  await openSpaceInfo(page, 'manage');
  await page.getByRole('button', { name: 'ویرایش بستر' }).click();
  await expect(page.getByLabel('عنوان')).toBeVisible();

  // An edit that matches an explicit rule is refused, and the space is untouched.
  const purpose = page.getByLabel('معرفی بستر');
  const keptPurpose = await purpose.inputValue();
  await purpose.fill(`${keptPurpose} اینجا شرط‌بندی هم می‌کنیم.`);
  await page.getByRole('button', { name: 'ذخیرهٔ تغییرات' }).click();
  await expect(page.getByRole('alert')).toContainText('نسخهٔ منتشرشده بدون تغییر ماند');
  await expect(page.getByText(/gambling@v1/)).toBeVisible();

  // An ordinary edit applies, and the space stays published.
  const edited = `${original} (ویرایش‌شده)`;
  await purpose.fill(keptPurpose);
  await page.getByLabel('عنوان').fill(edited);
  await page.getByRole('button', { name: 'ذخیرهٔ تغییرات' }).click();

  await page.getByRole('button', { name: 'بستن' }).click();
  await expect(page.getByRole('heading', { level: 1, name: edited })).toBeVisible();
  // Still published: an edit to a published space never sends it back for review.
  await expect(page.getByText('در انتظار بررسی')).toHaveCount(0);
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
