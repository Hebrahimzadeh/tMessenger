import { test, expect, type Page } from '@playwright/test';
import { loginViaDevOtp } from './helpers/dev-login';
import { buildSpaceFromPrompt, LENDING_PROMPT } from './helpers/build-space';

// Targets the local dev stack - see auth.spec.ts's header comment for how
// to start the API. "نردبان" (ladder) is this plan's own running example
// of a REUSABLE_RESOURCE card that goes through the full public
// reservation lifecycle end to end: create -> public comment -> reserve
// (redirect to a real direct chat) -> mark-in-use -> close(RETURNED) ->
// the closed card shows a disabled reserve button with the exact required
// phrase, never a "منقضی" tag or any other terminal badge in the feed.

async function createAndPublishSpace(page: Page, title: string): Promise<string> {
  // One prompt, no fields: the title is carried in the prompt so the built
  // space is recognisable, and the space is published and shown straight away.
  return buildSpaceFromPrompt(page, `${LENDING_PROMPT} - ${title}`);
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


test('the ladder is inferred as something to lend, and says its close is final before it is posted', async ({ page }) => {
  await loginViaDevOtp(page, '/spaces/new');
  const spaceUrl = await createAndPublishSpace(page, `امانات ابزار ${Math.floor(Math.random() * 1_000_000)}`);

  await page.goto(spaceUrl);
  await page.getByRole('button', { name: 'ثبت کارت جدید' }).click();
  await page.getByLabel('متن کارت').fill('یک نردبان دارم که می‌توانم قرض بدهم. هر وقت لازم داشتید خبر بدهید.');

  await page.getByRole('button', { name: 'پیشنهاد برای این متن' }).click();
  await expect(page.getByText('پیشنهاد برای این کارت')).toBeVisible();

  // The plan's own example: lent, returned, and the card is finished when
  // the lending is.
  await expect(page.getByLabel('نوع کارت')).toHaveValue('REUSABLE_RESOURCE');
  await expect(page.getByText(/بستن آن نهایی است/)).toBeVisible();
  await expect(page.getByText('بعد از استفاده باید به شما برگردانده شود؟')).toBeVisible();

  await page.getByRole('button', { name: 'اعمال موارد انتخاب‌شده' }).click();
  await expect(page.getByText('چیزی برای امانت')).toBeVisible();

  await page.getByRole('button', { name: 'ثبت کارت', exact: true }).click();
  await page.waitForURL((url) => /^\/cards\//.test(url.pathname));
});

test('a suggested kind can be corrected before the card exists', async ({ page }) => {
  await loginViaDevOtp(page, '/spaces/new');
  const spaceUrl = await createAndPublishSpace(page, `کارگاه محله ${Math.floor(Math.random() * 1_000_000)}`);

  await page.goto(spaceUrl);
  await page.getByRole('button', { name: 'ثبت کارت جدید' }).click();
  await page.getByLabel('متن کارت').fill('یک نردبان دارم که می‌توانم قرض بدهم.');
  await page.getByRole('button', { name: 'پیشنهاد برای این متن' }).click();
  await expect(page.getByText('پیشنهاد برای این کارت')).toBeVisible();

  // They know better than the classifier, and the behaviour shown updates to
  // match what they chose rather than what was proposed.
  await page.getByLabel('نوع کارت').selectOption('PARTICIPATION');
  await expect(page.getByText(/رزرو نمی‌شود/)).toBeVisible();

  await page.getByRole('button', { name: 'اعمال موارد انتخاب‌شده' }).click();
  await expect(page.getByText('دعوت به مشارکت')).toBeVisible();

  await page.getByRole('button', { name: 'ثبت کارت', exact: true }).click();
  await page.waitForURL((url) => /^\/cards\//.test(url.pathname));
});

test('with the suggestion unavailable, a card is still one click away', async ({ page }) => {
  // The AI-off case the plan asks for. The server half is unit-tested (no
  // provider, a timeout, a refusal and a wrong-shaped answer all produce the
  // same kind and pattern); what only a browser can show is that the person
  // is not blocked, so the endpoint is failed outright here.
  await page.route('**/v1/spaces/*/cards/infer', (route) => route.abort('failed'));

  await loginViaDevOtp(page, '/spaces/new');
  const spaceUrl = await createAndPublishSpace(page, `بستر بی‌دستیار ${Math.floor(Math.random() * 1_000_000)}`);

  await page.goto(spaceUrl);
  await page.getByRole('button', { name: 'ثبت کارت جدید' }).click();
  await page.getByLabel('متن کارت').fill('یه چیزی برای کمک دارم');

  await page.getByRole('button', { name: 'پیشنهاد برای این متن' }).click();
  await expect(page.getByText(/همان‌طور که نوشته‌اید ثبت کنید/)).toBeVisible();

  // And the card goes out anyway, with a title from the first line.
  await page.getByRole('button', { name: 'ثبت کارت', exact: true }).click();
  await page.waitForURL((url) => /^\/cards\//.test(url.pathname));
  await expect(page.getByRole('heading', { name: 'یه چیزی برای کمک دارم' })).toBeVisible();
});

test('a generic sentence publishes without ever asking for a suggestion', async ({ page }) => {
  await loginViaDevOtp(page, '/spaces/new');
  const spaceUrl = await createAndPublishSpace(page, `بستر ساده ${Math.floor(Math.random() * 1_000_000)}`);

  await page.goto(spaceUrl);
  await page.getByRole('button', { name: 'ثبت کارت جدید' }).click();
  await page.getByLabel('متن کارت').fill('یه خبر برای محله دارم که گفتنش بد نیست.');

  // No kind selector stands between them and posting - "فرم نوع اجباری نیست".
  await expect(page.getByLabel('نوع کارت')).toHaveCount(0);
  await page.getByRole('button', { name: 'ثبت کارت', exact: true }).click();

  await page.waitForURL((url) => /^\/cards\//.test(url.pathname));
  await expect(page.getByRole('heading', { name: 'یه خبر برای محله دارم که گفتنش بد نیست.' })).toBeVisible();
});
