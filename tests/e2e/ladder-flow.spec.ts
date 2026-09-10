import { test, expect, type Page } from '@playwright/test';
import { loginViaDevOtp } from './helpers/dev-login';

// Targets the local dev stack - see auth.spec.ts's header comment for how
// to start the API. "نردبان" (ladder) is this plan's own running example
// of a REUSABLE_RESOURCE card that goes through the full public
// reservation lifecycle end to end: create -> public comment -> reserve
// (redirect to a real direct chat) -> mark-in-use -> close(RETURNED) ->
// the closed card shows a disabled reserve button with the exact required
// phrase, never a "منقضی" tag or any other terminal badge in the feed.

async function createAndPublishSpace(page: Page, title: string): Promise<string> {
  await page.goto('/spaces/new');
  await page.getByLabel('عنوان بستر').fill(title);
  await page
    .getByLabel('این بستر برای چیست؟')
    .fill('این بستر برای هماهنگی داوطلبانه‌ی نگهداری ابزار مشترک محله تشکیل شده است.');
  await page.getByRole('button', { name: 'ادامه' }).click();

  await expect(page.getByLabel('نقش اصلی اول')).toBeVisible();
  await page.getByLabel('روش‌های مشارکت (با ویرگول جدا کنید)').fill('حضوری');
  await page.getByRole('button', { name: 'ادامه' }).click();

  await expect(page.getByText('این بستر آمادهٔ انتشار است.')).toBeVisible();
  await page.getByRole('button', { name: 'انتشار' }).click();
  await expect(page.getByText('بستر شما منتشر شد!')).toBeVisible();

  const spaceLink = page.getByRole('link', { name: 'مشاهدهٔ بستر' });
  const href = await spaceLink.getAttribute('href');
  return new URL(href!, page.url()).toString();
}

test('two users take a REUSABLE_RESOURCE card through the full ladder: create, public comment, reserve, chat redirect, in-use, close(RETURNED), disabled reservation', async ({
  page,
  context,
}) => {
  await loginViaDevOtp(page, '/spaces/new');
  const title = `ابزار محله آزمایشی ${Math.floor(Math.random() * 1_000_000)}`;
  const spaceUrl = await createAndPublishSpace(page, title);

  // --- Owner (user A): create the "نردبان" card -----------------------
  await page.goto(spaceUrl);
  await page.getByRole('button', { name: 'ثبت کارت جدید' }).click();
  await page.getByLabel('متن کارت').fill('نردبان سه‌متری قابل امانت برای کارهای محله. هر کس نیاز داشت رزرو کند.');
  await page.getByRole('button', { name: 'ثبت کارت', exact: true }).click();

  await page.waitForURL((url) => /^\/cards\//.test(url.pathname));
  const cardUrl = page.url();
  await expect(page.getByRole('heading', { name: /نردبان/ })).toBeVisible();

  // --- A second, independent user (user B) --------------------------
  const userBPage = await (await context.browser()!.newContext()).newPage();
  await loginViaDevOtp(userBPage, '/');
  await userBPage.goto(cardUrl);

  // Public comment - "پرسش یا مشارکت عمومی" is the primary CTA. Scoped to
  // a <p> (not a bare text search) so it can never strict-mode-collide with
  // the composer's own <textarea>, whose value transiently still holds the
  // same text right after submit, before it clears.
  const commentText = 'هنوز موجود است؟ می‌خواهم آخر هفته رزرو کنم.';
  await userBPage.getByLabel('متن نظر').fill(commentText);
  await userBPage.getByRole('button', { name: 'پرسش یا مشارکت عمومی' }).click();
  await expect(userBPage.locator('p', { hasText: commentText })).toBeVisible();

  // Owner can see the same public comment too.
  await page.reload();
  await expect(page.locator('p', { hasText: commentText })).toBeVisible();

  // --- User B reserves - no accept step, immediate redirect to a real chat ---
  await userBPage.getByRole('button', { name: 'رزرو' }).click();
  await userBPage.waitForURL((url) => /^\/chats\//.test(url.pathname));

  // --- Owner marks it in-use, then closes it as RETURNED --------------
  await page.reload();
  await page.getByRole('button', { name: 'علامت‌گذاری به‌عنوان در حال استفاده' }).click();
  await expect(page.getByText('این کارت در حال استفاده است.')).not.toBeVisible(); // owner still sees the close controls, not the stranger-view text
  await expect(page.getByText('دلیل بسته‌شدن')).toBeVisible();

  await page.getByLabel('دلیل بسته‌شدن').selectOption('RETURNED');
  await page.getByRole('button', { name: 'بستن رزرو' }).click();

  // --- Terminal state: disabled reservation, the exact required phrase ---
  await expect(page.getByRole('button', { name: 'رزرو' })).toBeDisabled();
  await expect(page.getByText('رزرو این کارت بسته شده است.')).toBeVisible();

  // The same holds for user B (a stranger to the now-closed reservation) and survives a refresh.
  await userBPage.goto(cardUrl);
  await expect(userBPage.getByRole('button', { name: 'رزرو' })).toBeDisabled();
  await expect(userBPage.getByText('رزرو این کارت بسته شده است.')).toBeVisible();

  // Back on the space feed, the card never carries an "expired"/terminal badge.
  await page.goto(spaceUrl);
  await expect(page.getByText(/منقضی/)).toHaveCount(0);
});
