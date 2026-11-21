import { expect, test } from "@playwright/test";

test("the page loads", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/");
  await expect(page).toHaveTitle(/Park the Cart/);
  expect(errors).toEqual([]);
});
