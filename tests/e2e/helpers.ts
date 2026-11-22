import type { Page } from "@playwright/test";

/**
 * Opens a test URL (`?test=1...`) and waits until the game has booted. Booting waits for the
 * fonts, so right after `goto` the test hooks on `window.__cart` may not be there yet.
 */
export async function open(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForFunction(() => "__cart" in window);
}
