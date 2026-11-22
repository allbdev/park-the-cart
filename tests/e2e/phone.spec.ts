import { expect, test, type Browser } from "@playwright/test";
import { open } from "./helpers";

type Hooks = { __cart: { world(): { tick: number; cart: { body: { x: number; y: number } } } } };

/** A phone, whichever browser the project uses: touch, and the given way up. */
async function phone(browser: Browser, width: number, height: number) {
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: true });
  // The game decides "touch" from the pointer type; say so for browsers that can't emulate it.
  await ctx.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q: string) =>
      q.includes("pointer: coarse") || q.includes("hover: none")
        ? ({
            ...real(q),
            matches: true,
            media: q,
            addEventListener() {},
            removeEventListener() {},
          } as unknown as MediaQueryList)
        : real(q);
  });
  return ctx.newPage();
}

test("a phone held upright is asked to turn sideways, and the game waits", async ({ browser }) => {
  const page = await phone(browser, 390, 780);
  await open(page, "/?test=1&level=01-seniors-space");
  const card = page.getByTestId("rotate");
  await expect(card).toBeVisible();
  await expect(card).toContainText("Turn your phone sideways");
  // Nothing behind the card can be touched, so the clock doesn't start.
  await page.mouse.click(100, 600);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => (window as unknown as Hooks).__cart.world().tick)).toBe(0);

  // Turned on its side: the card goes away by itself.
  await page.setViewportSize({ width: 780, height: 360 });
  await expect(card).toBeHidden();
  await page.setViewportSize({ width: 390, height: 780 });
  await expect(card).toBeVisible();

  // Or the player insists, and isn't asked again on the next level.
  await card.getByRole("button", { name: "Play upright anyway" }).click();
  await expect(card).toBeHidden();
  await open(page, "/?test=1&level=02-sunday-morning");
  await page.close();
});

test("a phone on its side gets a thin HUD that leaves the lot in view", async ({ browser }) => {
  const page = await phone(browser, 800, 300);
  await open(page, "/?test=1&level=06-wind");
  await expect(page.getByTestId("rotate")).toBeHidden();
  // The level's name and the cart's fault aren't repeated; time, damage, limit and wind are.
  await expect(page.locator(".hud-left > .hud-box").first()).toBeHidden();
  await expect(page.locator(".hud-wheel")).toBeHidden();
  await expect(page.getByTestId("limit")).toBeVisible();
  await expect(page.getByTestId("wind")).toBeVisible();
  // Everything in the top strip fits in the first 50 px and nothing overlaps.
  const boxes = await page
    .locator(".hud-left > *:visible, .pause-btn, .restart")
    .evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { l: r.left, r: r.right, b: r.bottom };
      }),
    );
  for (const b of boxes) expect(b.b).toBeLessThanOrEqual(50);
  const sorted = boxes.sort((a, b) => a.l - b.l);
  for (let i = 1; i < sorted.length; i++)
    expect(sorted[i]!.l).toBeGreaterThanOrEqual(sorted[i - 1]!.r - 1);
  await page.close();
});

test("the stick appears under the thumb, anywhere on the left half", async ({ browser }) => {
  const page = await phone(browser, 800, 300);
  await open(page, "/?test=1&level=01-seniors-space");
  const before = await page.evaluate(() => (window as unknown as Hooks).__cart.world().cart.body.x);
  // Thumb down in the middle of the left half, then pushed right: the stick points where to go,
  // and the cart, which faces east, rolls east.
  await page.mouse.move(250, 180);
  await page.mouse.down();
  const ring = await page.locator(".stick").boundingBox();
  expect(Math.abs(ring!.x + ring!.width / 2 - 250)).toBeLessThan(3);
  expect(Math.abs(ring!.y + ring!.height / 2 - 180)).toBeLessThan(3);
  await page.mouse.move(310, 180, { steps: 4 });
  await page.waitForTimeout(900);
  await page.mouse.up();
  const after = await page.evaluate(() => (window as unknown as Hooks).__cart.world().cart.body.x);
  expect(after).toBeGreaterThan(before + 0.3);
  // Let go and the ring goes back to rest in its corner.
  const rest = await page.locator(".stick").boundingBox();
  expect(rest!.x).toBeLessThan(60);
  await page.close();
});

test("the pause menu and the result fit a phone on its side", async ({ browser }) => {
  const page = await phone(browser, 800, 300);
  await open(page, "/?test=1&level=01-seniors-space");
  await page.locator(".pause-btn").click();
  for (const name of ["Resume", "Restart", "Levels"]) {
    const box = await page.locator(".pause-card").getByRole("button", { name }).boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(300);
  }
  await page.locator(".pause-card").getByRole("button", { name: "Resume" }).click();
  await page.evaluate(() =>
    (window as unknown as { __cart: { playPar(): void } }).__cart.playPar(),
  );
  await expect(page.getByTestId("result-tag")).toContainText("Cart parked", { timeout: 10_000 });
  // The price tag and the first row of buttons are on screen without scrolling.
  const tag = await page.getByTestId("result-tag").boundingBox();
  expect(tag!.y).toBeGreaterThanOrEqual(0);
  expect(tag!.y + tag!.height).toBeLessThanOrEqual(300);
  const again = await page.getByTestId("again").boundingBox();
  expect(again!.y + again!.height).toBeLessThanOrEqual(300);
  await page.close();
});

test("the menus fit a phone on its side, and scroll when even that isn't enough", async ({
  browser,
}) => {
  const page = await phone(browser, 915, 300);
  await open(page, "/?test=1");
  const inView = async (testId: string, height: number) => {
    const box = (await page.getByTestId(testId).boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(height);
  };
  // Landing: both buttons on screen without scrolling.
  await inView("play", 300);
  await inView("daily", 300);
  // The blurred picture is pinned to the screen, so scrolling can't leave a bare strip.
  expect(await page.locator(".backdrop").evaluate((el) => getComputedStyle(el).position)).toBe(
    "fixed",
  );

  // On something shorter still, the page scrolls and the button can be reached.
  await page.setViewportSize({ width: 700, height: 200 });
  const scroll = await page.locator("main.landing").evaluate((el) => ({
    overflow: getComputedStyle(el).overflowY,
    more: el.scrollHeight > el.clientHeight,
  }));
  expect(scroll).toEqual({ overflow: "auto", more: true });
  await page.getByTestId("daily").scrollIntoViewIfNeeded();
  await inView("daily", 200);

  // How it works: the three cards and the button, also without scrolling.
  await page.setViewportSize({ width: 915, height: 300 });
  await page.getByTestId("play").click();
  await expect(page.locator("h1")).toHaveText("How it works");
  await inView("go", 300);
  const top = (await page.locator("h1").boundingBox())!;
  expect(top.y).toBeGreaterThanOrEqual(0);
  await page.close();
});

test("upright, the landing scrolls with its background in place", async ({ browser }) => {
  const page = await phone(browser, 360, 520);
  await open(page, "/?test=1");
  const main = page.locator("main.landing");
  expect(await main.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await main.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  // Scrolled to the end, the picture still covers the whole screen.
  const box = await page.locator(".backdrop").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom };
  });
  expect(box.top).toBeLessThanOrEqual(0);
  expect(box.bottom).toBeGreaterThanOrEqual(520);
  await page.close();
});
