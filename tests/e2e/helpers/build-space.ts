import type { Page } from '@playwright/test';

/**
 * Makes a space the way the product makes one: a single prompt.
 *
 * Returns the URL of the space the person lands on. Callers that need a
 * published, publicly visible space should pass a prompt with nothing in it
 * for the policy baseline to flag - anything ambiguous is held for a human
 * and stays invisible to everyone but its creator.
 */
export async function buildSpaceFromPrompt(page: Page, prompt: string): Promise<string> {
  await page.goto('/spaces/new');
  await page.getByLabel('چه بستری می‌خواهید؟').fill(prompt);
  await page.getByRole('button', { name: 'ساخت بستر' }).click();

  // Building can take a few seconds when a model is configured; the redirect
  // is the signal that the space exists.
  await page.waitForURL((url) => /^\/spaces\/./.test(url.pathname) && !url.pathname.endsWith('/new'), { timeout: 60_000 });
  return page.url();
}

/** A prompt that builds a lending space with nothing for the rules to flag. */
export const LENDING_PROMPT = 'همسایه‌ها وسایلی مثل نردبان و دریل را به هم امانت بدهند';
