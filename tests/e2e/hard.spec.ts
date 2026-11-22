import { expect, test } from "@playwright/test";
import { open } from "./helpers";

type Hooks = { __cart: { playInputs(i: unknown[]): void; playPar(): void } };

test("going over a level's card limit ends the run: card declined", async ({ page }) => {
  await open(page, "/?test=1&level=10-rush-hour");
  await expect(page.getByTestId("limit")).toContainText("R$ 100");
  // Straight out of the stall and across the lot, whatever is in the way.
  const inputs = Array.from({ length: 1500 }, () => ({ push: 1, turn: 0, hold: false }));
  await page.evaluate((i) => (window as unknown as Hooks).__cart.playInputs(i), inputs);
  await expect(page.getByTestId("result-tag")).toContainText("Card declined", { timeout: 10_000 });
  await expect(page.getByTestId("result-tag")).toContainText("R$ 100");
  // A failed run doesn't offer the next level.
  await expect(page.getByTestId("next")).toHaveCount(0);
  await expect(page.getByTestId("again")).toBeVisible();
});

for (const id of ["06-wind", "08-black-friday", "10-rush-hour"]) {
  test(`${id}: the recorded run threads the traffic in this browser too`, async ({ page }) => {
    await open(page, `/?test=1&level=${id}`);
    await expect(page.locator("canvas.lot")).toBeVisible();
    await page.evaluate(() => (window as unknown as Hooks).__cart.playPar());
    await expect(page.getByTestId("result-tag")).toContainText("Cart parked", { timeout: 10_000 });
    await expect(page.getByTestId("share")).toContainText("without a scratch");
  });
}

test("windy levels show which way the wind blows and when it gusts", async ({ page }) => {
  await open(page, "/?test=1&level=06-wind");
  const word = page.getByTestId("wind-word");
  await expect(word).toHaveText("calm");
  await expect(page.locator(".wind-arrow")).toBeVisible();
  // Hold still until the first gust builds (it's on the tick, so it's the same every time),
  // and read the gauge in the same breath: the game keeps running and the gust passes.
  const wait = Array.from({ length: 840 }, () => ({ push: 0, turn: 0, hold: true }));
  const gauge = await page.evaluate((i) => {
    (window as unknown as Hooks).__cart.playInputs(i);
    return {
      word: document.querySelector('[data-testid="wind-word"]')!.textContent,
      fill: parseFloat(document.querySelector<HTMLElement>(".wind-fill")!.style.width),
    };
  }, wait);
  expect(gauge.word).toBe("gust!");
  expect(gauge.fill).toBeGreaterThan(30);
});

test("levels without wind have no wind gauge", async ({ page }) => {
  await open(page, "/?test=1&level=03-speed-bump");
  await expect(page.locator("canvas.lot")).toBeVisible();
  await expect(page.getByTestId("wind")).toHaveCount(0);
});

test("the next cart opens only after every level is finished with the one before", async ({
  page,
}) => {
  const ids = [
    "01-seniors-space",
    "02-sunday-morning",
    "03-speed-bump",
    "04-abandoned-cart",
    "05-the-slope",
    "06-wind",
    "07-rain",
    "08-black-friday",
    "09-managers-car",
    "10-rush-hour",
  ];
  const save = (done: object) =>
    page.evaluate(
      (d) =>
        localStorage.setItem(
          "park-the-cart.v1",
          JSON.stringify({
            locale: "en",
            finished: 10,
            cart: "standard",
            best: {},
            daily: {},
            done: d,
          }),
        ),
      done,
    );
  await open(page, "/?test=1");
  await save({ standard: ids.slice(0, 9) });
  await page.reload();
  await page.getByTestId("play").click();
  await expect(page.getByTestId("cart-progress")).toContainText("9 of 10");
  const rusty = page.getByTestId("cart-rusty");
  await expect(rusty).toHaveAttribute("aria-disabled", "true");
  await expect(rusty).toContainText("Finish all 10 levels with the Standard cart to unlock (9/10)");
  // Clicking a locked cart changes nothing.
  await rusty.click({ force: true });
  await expect(page.getByTestId("cart-standard")).toHaveAttribute("aria-checked", "true");

  // The tenth level done: the rusty cart opens, the basket still waits on the rusty one.
  await save({ standard: ids });
  await page.reload();
  await page.getByTestId("play").click();
  await expect(page.getByTestId("cart-rusty")).not.toHaveAttribute("aria-disabled", "true");
  await expect(page.getByTestId("cart-basket")).toContainText(
    "with the Rusty cart to unlock (0/10)",
  );
  await page.getByTestId("cart-rusty").click();
  await expect(page.getByTestId("cart-rusty")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("cart-progress")).toContainText("0 of 10");
});
