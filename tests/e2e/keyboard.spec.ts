import { expect, test } from "@playwright/test";

test.skip(({ isMobile }) => isMobile, "keyboard only on desktop");

/** Presses Tab until the element with this accessible name has focus. */
async function tabTo(page: import("@playwright/test").Page, name: RegExp) {
  // Safari moves focus to buttons with Option+Tab unless the user changed the macOS setting.
  const key = page.context().browser()?.browserType().name() === "webkit" ? "Alt+Tab" : "Tab";
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press(key);
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el ? (el.getAttribute("aria-label") ?? el.textContent ?? "") : "";
    });
    if (name.test(focused)) return;
  }
  throw new Error(`never reached ${name}`);
}

test("the whole flow works with the keyboard alone", async ({ page }) => {
  await page.goto("/?test=1");
  // The screen starts at its heading.
  await expect(page.locator("h1")).toBeFocused();
  await tabTo(page, /^Play$/i);
  await page.keyboard.press("Enter");
  await expect(page.locator("h1")).toHaveText("How it works");
  await tabTo(page, /give me the cart/i);
  await page.keyboard.press("Enter");
  await expect(page.locator("main.play")).toBeFocused();
  // Drive: the clock starts on the first key.
  await page.keyboard.down("KeyW");
  // Headless WebKit on Linux paints slowly; wait for the clock rather than a fixed time.
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as unknown as { __cart: { world(): { tick: number } } }).__cart.world().tick,
        ),
      { timeout: 10_000 },
    )
    .toBeGreaterThan(30);
  await page.keyboard.up("KeyW");
  // Pause with Esc, resume with Enter on the focused button.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("level cards are buttons with names, and locked ones say so", async ({ page }) => {
  await page.goto("/?test=1");
  await page.evaluate(() =>
    localStorage.setItem("park-the-cart.v1", JSON.stringify({ finished: 2 })),
  );
  await page.reload();
  await page.getByTestId("play").click();
  await expect(page.getByRole("button", { name: "Level 3, Speed Bump" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Level 4, Abandoned Cart: locked/ })).toBeVisible();
});
