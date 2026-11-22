import { expect, test } from "@playwright/test";
import { open } from "./helpers";

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
  await open(page, "/?test=1");
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
  await open(page, "/?test=1");
  await page.evaluate(() =>
    localStorage.setItem("park-the-cart.v1", JSON.stringify({ finished: 2 })),
  );
  await page.reload();
  await page.getByTestId("play").click();
  await expect(page.getByRole("button", { name: "Level 3, Speed Bump" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Level 4, Abandoned Cart: locked/ })).toBeVisible();
});

test("up goes up the screen; the pause menu switches back to classic steering", async ({
  page,
}) => {
  type W = { __cart: { world(): { tick: number; cart: { body: { x: number; y: number } } } } };
  const pos = () => page.evaluate(() => (window as unknown as W).__cart.world().cart.body);
  const hold = async (key: string, ticks: number) => {
    const from = await page.evaluate(() => (window as unknown as W).__cart.world().tick);
    await page.keyboard.down(key);
    await expect
      .poll(() => page.evaluate(() => (window as unknown as W).__cart.world().tick), {
        timeout: 15_000,
      })
      .toBeGreaterThan(from + ticks);
    await page.keyboard.up(key);
  };
  // Level 1 starts in the aisle facing east (right).
  await open(page, "/?test=1&level=01-seniors-space");
  await expect(page.locator("main.play")).toBeFocused();
  await expect(page.locator(".hint")).toContainText("press the way you want");
  const start = await pos();
  await hold("ArrowUp", 150);
  const up = await pos();
  // It turned and went up the screen (y shrinks), not along the aisle.
  expect(up.y).toBeLessThan(start.y - 0.4);
  expect(Math.abs(up.x - start.x)).toBeLessThan(start.y - up.y + 0.6);

  // Classic steering from the pause menu: now up pushes the way the cart faces.
  await page.keyboard.press("Escape");
  const classic = page.getByRole("checkbox", { name: /Classic steering/ });
  await expect(classic).not.toBeChecked();
  await classic.check();
  await page.reload();
  await page.waitForFunction(() => "__cart" in window);
  await expect(page.locator(".hint")).toContainText("W or ↑ push");
  const again = await pos();
  await hold("ArrowUp", 150);
  const east = await pos();
  expect(east.x).toBeGreaterThan(again.x + 0.4);
});
