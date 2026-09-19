import { expect, type Page } from '@playwright/test';

/**
 * Opens a space's information sheet.
 *
 * A space is a conversation (owner decision, 2026-09-19), so everything that
 * is not the feed - roles, the invite link, health, the rules, editing -
 * lives behind the toolbar rather than down the page. The gear opens the
 * sheet straight onto its management side and exists only for whoever runs
 * the space; tapping the name opens the plain information side.
 */
export async function openSpaceInfo(page: Page, tab: 'info' | 'manage' = 'info'): Promise<void> {
  await page.getByRole('button', { name: tab === 'manage' ? 'مدیریت بستر' : 'مشخصات بستر' }).click();
  await expect(page.getByRole('heading', { name: 'مشخصات بستر' })).toBeVisible();
}
