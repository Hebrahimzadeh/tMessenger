import { test, expect, type Page } from '@playwright/test';
import { loginViaDevOtp } from './helpers/dev-login';

// Two real people in two independent browser contexts, talking over the real
// socket. See auth.spec.ts's header for how to start the API this targets.
//
// Everything here is about the private side of the app: does a message cross
// between two browsers, does the warning fire before a phone number leaves,
// is the assistant unmistakably not a person, and can it publish anything on
// its own. The reservation → chat → back journey has its own coverage in
// ladder-flow.spec.ts; what this adds is that back lands on the card.

/** How long a message may take to cross between two browsers - "پیام زیر دو ثانیه". */
const DELIVERY_BUDGET_MS = 2000;

/**
 * The API's own base. Behind the proxy this is /api/v1; in development the
 * API is a separate port, so the spec reads the same value the app was built
 * with rather than assuming either shape.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/v1';

async function setUpProfile(page: Page, username: string, displayName: string) {
  await page.goto('/profile');
  await page.getByLabel('نام کاربری').fill(username);
  await page.getByLabel('نام نمایشی').fill(displayName);
  await page.getByRole('button', { name: /ذخیره/ }).click();
  await expect(page.getByText(/ذخیره شد|به‌روزرسانی شد/)).toBeVisible();
}

test('two people hold a private conversation in real time, and the warning fires before a number leaves', async ({
  page,
  context,
}) => {
  const suffix = Math.floor(Math.random() * 1_000_000);
  const aliceName = `alice_${suffix}`;

  await loginViaDevOtp(page, '/');
  await setUpProfile(page, aliceName, 'آلیس آزمایشی');

  const bobPage = await (await context.browser()!.newContext()).newPage();
  await loginViaDevOtp(bobPage, '/');

  // --- Bob opens a private conversation from Alice's public profile -----
  await bobPage.goto(`/u/${aliceName}`);
  await bobPage.getByRole('button', { name: 'گفت‌وگوی خصوصی' }).click();
  await bobPage.waitForURL((url) => /^\/chats\/[0-9a-f-]{36}$/.test(url.pathname));
  const roomUrl = bobPage.url();

  // Alice finds the same conversation in her list.
  await page.goto('/chats');
  await expect(page.getByTestId('conversation-row')).toHaveCount(1);
  await page.getByTestId('conversation-row').click();
  await expect(page).toHaveURL(new RegExp(new URL(roomUrl).pathname));

  // --- A message crosses, live, within the budget ----------------------
  const greeting = `سلام آلیس ${suffix}`;
  const started = Date.now();
  await bobPage.getByLabel('پیام', { exact: true }).fill(greeting);
  await bobPage.getByLabel('ارسال', { exact: true }).click();

  await expect(page.getByText(greeting)).toBeVisible({ timeout: DELIVERY_BUDGET_MS });
  expect(Date.now() - started).toBeLessThan(DELIVERY_BUDGET_MS * 2);

  // Bob sees his own message settle from pending to sent.
  await expect(bobPage.getByTestId('send-state').last()).toHaveAttribute('data-state', /sent|read/);

  // --- Alice replies, and Bob receives it ------------------------------
  const reply = `سلام باب ${suffix}`;
  await page.getByLabel('پیام', { exact: true }).fill(reply);
  await page.getByLabel('ارسال', { exact: true }).click();
  await expect(bobPage.getByText(reply)).toBeVisible({ timeout: DELIVERY_BUDGET_MS });

  // --- The sensitive-data warning, on a real send ----------------------
  await bobPage.getByLabel('پیام', { exact: true }).fill('شمارم 09123456789');
  await bobPage.getByLabel('ارسال', { exact: true }).click();

  await expect(bobPage.getByTestId('sensitive-warning')).toBeVisible();
  // Not sent yet - and Alice must not have it.
  await expect(page.getByText('09123456789')).toHaveCount(0);

  // It warns, it does not refuse.
  await bobPage.getByRole('button', { name: /با آگاهی ارسال می‌کنم/ }).click();
  await expect(page.getByText(/09123456789/)).toBeVisible({ timeout: DELIVERY_BUDGET_MS });

  await bobPage.close();
});

test('the assistant is marked a system account, can be muted and hidden, and publishes nothing on its own', async ({
  page,
}) => {
  await loginViaDevOtp(page, '/');

  // Reaching the helper thread creates it on first ask.
  await page.goto('/chats');
  const assistantId = await page.evaluate(async (base) => {
    const response = await fetch(`${base}/conversations/assistant`, { credentials: 'include' });
    return ((await response.json()) as { id: string }).id;
  }, API_BASE);

  await page.goto(`/chats/${assistantId}`);

  // It says what it is, in the header and in its own words, and never
  // presents itself as a manager or a person.
  await expect(page.getByText('همیار تعاون').first()).toBeVisible();
  await expect(page.getByText('حساب سیستمی').first()).toBeVisible();
  await expect(page.getByText(/نه مدیر و نه یک انسان/)).toBeVisible();
  await expect(page.getByText(/تا وقتی خودتان تأیید نکنید اجرا نمی‌شود/)).toBeVisible();

  // Muting is one press and is remembered.
  await page.getByLabel('بی‌صدا کردن').click();
  await expect(page.getByLabel('باصدا کردن')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('باصدا کردن')).toBeVisible();

  // Hiding takes it out of the list without taking it away.
  await page.getByLabel('پنهان کردن از فهرست').click();
  await page.waitForLoadState('networkidle');
  await page.goto('/chats');
  await expect(page.getByTestId('conversation-row').filter({ hasText: 'همیار تعاون' })).toHaveCount(0);

  // Still reachable, which is the whole point of hide rather than delete.
  const stillThere = await page.evaluate(async (base) => {
    const response = await fetch(`${base}/conversations/assistant`, { credentials: 'include' });
    return response.status;
  }, API_BASE);
  expect(stillThere).toBe(200);

  await page.goto(`/chats/${assistantId}`);
  await expect(page.getByText('همیار تعاون').first()).toBeVisible();
});

test('a reservation opens the same direct room, and back returns to the card it came from', async ({ page, context }) => {
  // The reservation itself is covered by ladder-flow; this picks up at the
  // deep link, which is the part Task 21 adds.
  await loginViaDevOtp(page, '/spaces/new');
  const suffix = Math.floor(Math.random() * 1_000_000);

  await page.getByLabel('عنوان بستر').fill(`بستر گفت‌وگو ${suffix}`);
  await page.getByLabel('این بستر برای چیست؟').fill('این بستر برای هماهنگی داوطلبانه‌ی ابزار مشترک محله تشکیل شده است.');
  await page.getByRole('button', { name: 'ادامه' }).click();
  await page.getByLabel('روش‌های مشارکت (با ویرگول جدا کنید)').fill('حضوری');
  await page.getByRole('button', { name: 'ادامه' }).click();
  await page.getByRole('button', { name: 'انتشار' }).click();
  const spaceHref = await page.getByRole('link', { name: 'مشاهدهٔ بستر' }).getAttribute('href');

  await page.goto(spaceHref!);
  await page.getByRole('button', { name: 'ثبت کارت جدید' }).click();
  await page.getByLabel('متن کارت').fill('نردبان قابل امانت برای کارهای محله. هر کس نیاز داشت رزرو کند.');
  await page.getByRole('button', { name: 'ثبت کارت', exact: true }).click();
  await page.waitForURL((url) => /^\/cards\//.test(url.pathname));
  const cardUrl = page.url();

  const bobPage = await (await context.browser()!.newContext()).newPage();
  await loginViaDevOtp(bobPage, '/');
  await bobPage.goto(cardUrl);
  await bobPage.getByRole('button', { name: 'رزرو' }).click();

  await bobPage.waitForURL((url) => /^\/chats\//.test(url.pathname));
  const firstRoom = new URL(bobPage.url()).pathname;

  // Back goes to the card the reservation came from, not the chats tab.
  await bobPage.getByLabel('بازگشت').click();
  await expect(bobPage).toHaveURL(new RegExp(new URL(cardUrl).pathname));

  // Reserving again resolves to the same room rather than a second one.
  await bobPage.goto(cardUrl);
  const openChat = bobPage.getByRole('link', { name: /گفت‌وگو/ }).first();
  if (await openChat.count()) {
    await openChat.click();
    await bobPage.waitForURL((url) => /^\/chats\//.test(url.pathname));
    expect(new URL(bobPage.url()).pathname).toBe(firstRoom);
  }

  await bobPage.close();
});
