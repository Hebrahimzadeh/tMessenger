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
  // The heading, not a bare substring: while the panel is still loading the
  // page also holds "در حال بارگذاری سلامت بستر..." and a substring match
  // resolves to both, which fails Playwright's strict mode at random.
  await expect(page.getByRole('heading', { name: 'سلامت بستر' })).toBeVisible();
  // Scoped to the exact status value (not a bare substring search) -
  // Task 17's own "ثبت کارت جدید" button also contains "جدید".
  await expect(page.getByText('جدید', { exact: true })).toBeVisible();

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

test('a blocked title never becomes a space, and the same person can rewrite it', async ({ page }) => {
  await loginViaDevOtp(page, '/spaces/new');

  // Matches the seeded `gambling` rule, whose source is a named law.
  await page.getByLabel('عنوان بستر').fill(`باشگاه قمار محله ${Math.floor(Math.random() * 1_000_000)}`);
  await page.getByLabel('این بستر برای چیست؟').fill('هماهنگی برای بازی‌های محله.');
  await page.getByRole('button', { name: 'ادامه' }).click();

  // Next's own route announcer is also role=alert, so this names the
  // composer's error paragraph rather than every live region on the page.
  await expect(page.getByText('عنوان دیگری بنویسید', { exact: false })).toBeVisible();
  // No slug was claimed, so they are still on the first step with their own
  // text intact - "BLOCK هیچ Space/slug عمومی نسازد".
  await expect(page.getByLabel('عنوان بستر')).toBeVisible();

  const title = `باشگاه بازی محله ${Math.floor(Math.random() * 1_000_000)}`;
  await page.getByLabel('عنوان بستر').fill(title);
  await page.getByRole('button', { name: 'ادامه' }).click();
  await expect(page.getByLabel('نقش اصلی اول')).toBeVisible();
});

test('a BLOCK at precheck cites the rule and the law, and offers no publish button', async ({ page }) => {
  await loginViaDevOtp(page, '/spaces/new');

  await page.getByLabel('عنوان بستر').fill(`بستر بازی ${Math.floor(Math.random() * 1_000_000)}`);
  await page
    .getByLabel('این بستر برای چیست؟')
    .fill('برگزاری مسابقهٔ شرط‌بندی روی نتیجهٔ بازی‌های محله با جایزهٔ نقدی.');
  await page.getByRole('button', { name: 'ادامه' }).click();

  await expect(page.getByLabel('نقش اصلی اول')).toBeVisible();
  await page.getByLabel('روش‌های مشارکت (با ویرگول جدا کنید)').fill('حضوری');
  await page.getByRole('button', { name: 'ادامه' }).click();

  await expect(page.getByText('منتشر نخواهد شد', { exact: false })).toBeVisible();
  await expect(page.getByText(/gambling@v1/)).toBeVisible();
  await expect(page.getByText(/قانون مجازات اسلامی/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'انتشار' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'اعمال موارد انتخاب‌شده' })).toHaveCount(0);
});

test('a flagged-but-not-banned space goes to a person, and says it is not a violation', async ({ page }) => {
  await loginViaDevOtp(page, '/spaces/new');

  await page.getByLabel('عنوان بستر').fill(`صندوق محله ${Math.floor(Math.random() * 1_000_000)}`);
  await page.getByLabel('این بستر برای چیست؟').fill('صندوق همیاری محله با سود تضمینی ماهانه برای همهٔ اعضا.');
  await page.getByRole('button', { name: 'ادامه' }).click();

  await expect(page.getByLabel('نقش اصلی اول')).toBeVisible();
  await page.getByLabel('روش‌های مشارکت (با ویرگول جدا کنید)').fill('حضوری');
  await page.getByRole('button', { name: 'ادامه' }).click();

  await expect(page.getByText('یک نفر این درخواست را بررسی می‌کند.')).toBeVisible();
  await expect(page.getByText(/این به معنای تخلف نیست/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'انتشار' })).toHaveCount(0);
});

test('accepting some suggestions and rejecting others carries exactly the accepted ones back to the form', async ({
  page,
}) => {
  await loginViaDevOtp(page, '/spaces/new');

  await page.getByLabel('عنوان بستر').fill(`بستر ناقص ${Math.floor(Math.random() * 1_000_000)}`);
  await page.getByLabel('این بستر برای چیست؟').fill('کوتاه');
  await page.getByRole('button', { name: 'ادامه' }).click();

  await expect(page.getByLabel('نقش اصلی اول')).toBeVisible();
  await page.getByLabel('نقش اصلی اول').fill('کاشف');
  await page.getByRole('button', { name: 'ادامه' }).click();

  await expect(page.getByText(/توضیح هدف را کامل‌تر بنویسید/)).toBeVisible();

  // Reject the second proposed role, keep the first.
  await page.getByRole('checkbox', { name: /مشارکت‌کننده/ }).uncheck();
  await page.getByRole('button', { name: 'اعمال موارد انتخاب‌شده' }).click();

  await expect(page.getByLabel('نقش اصلی اول')).toHaveValue('هماهنگ‌کننده');
  // The rejected one was not applied, so their own second role stands.
  await expect(page.getByLabel('نقش اصلی دوم')).toHaveValue('همکار');
});

test('an outage in the gate becomes a human review in the browser, never a publish button', async ({ page }) => {
  // The server half of this is unit-tested (space-creation-gate.test.ts:
  // a broken, empty or hanging baseline all fail closed). What only a real
  // browser can show is what the person then sees, so the fail-closed
  // response the gate actually produces is replayed here verbatim.
  await page.route('**/v1/spaces/*/precheck', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        verdict: 'HUMAN_REVIEW',
        reason: 'بررسی خودکار در دسترس نبود، بنابراین یک نفر این درخواست را بررسی می‌کند.',
        status: 'HUMAN_REVIEW',
        policyVersionRef: 'unavailable',
        matchedPolicyRules: [],
        guidance: null,
      }),
    });
  });

  await loginViaDevOtp(page, '/spaces/new');

  await page.getByLabel('عنوان بستر').fill(`بستر قطعی ${Math.floor(Math.random() * 1_000_000)}`);
  await page
    .getByLabel('این بستر برای چیست؟')
    .fill('این بستر برای هماهنگی داوطلبانه‌ی نگهداری باغچه‌ی محله تشکیل شده است.');
  await page.getByRole('button', { name: 'ادامه' }).click();

  await expect(page.getByLabel('نقش اصلی اول')).toBeVisible();
  await page.getByLabel('روش‌های مشارکت (با ویرگول جدا کنید)').fill('حضوری');
  await page.getByRole('button', { name: 'ادامه' }).click();

  await expect(page.getByText(/بررسی خودکار در دسترس نبود/)).toBeVisible();
  // A definition that would otherwise have been ALLOWed cannot be published
  // just because the gate was unreachable.
  await expect(page.getByRole('button', { name: 'انتشار' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'بازگشت و ویرایش' })).toBeVisible();
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
