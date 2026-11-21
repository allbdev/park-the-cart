import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { decodeInputs } from "../../src/core/replay";

const level1 = JSON.parse(readFileSync("src/content/levels/01-seniors-space.json", "utf8")) as {
  par?: { inputs: string };
};

type Hooks = {
  __cart: { playInputs(i: unknown[]): void; world(): { status: string } | undefined };
};

test("landing → how it works → level 1 → parked with the par run → receipt", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/?test=1");
  await expect(page).toHaveTitle(/Park the Cart/);
  await page.getByTestId("play").click();
  await page.getByTestId("go").click();
  await expect(page.locator(".hud-value").first()).toContainText("Seniors");
  const inputs = decodeInputs(level1.par!.inputs)!;
  await page.evaluate((i) => (window as unknown as Hooks).__cart.playInputs(i), inputs);
  await expect(page.getByTestId("result-tag")).toContainText("Cart parked", { timeout: 10_000 });
  await expect(page.getByTestId("share")).toContainText("Park the Cart · level 1");
  await expect(page.getByTestId("share")).toContainText("without a scratch");
  // Level 2 is now unlocked.
  await page.getByTestId("next").click();
  await expect(page.locator(".hud-value").first()).toContainText("Sunday");
  expect(errors).toEqual([]);
});

test("the language toggle switches to Portuguese and is remembered", async ({ page }) => {
  await page.goto("/?test=1");
  await page.getByRole("button", { name: "Mudar para português" }).click();
  await expect(page.locator("h1")).toContainText("Estacione");
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  await page.reload();
  await expect(page.locator("h1")).toContainText("Estacione");
});

test("driving into a car bills it on the receipt", async ({ page }) => {
  await page.goto("/?test=1&level=03-speed-bump");
  const hit = Array.from({ length: 240 }, (_, k) => ({
    push: 1,
    turn: k < 90 ? 1 : 0.3,
    hold: false,
  }));
  await page.evaluate((i) => (window as unknown as Hooks).__cart.playInputs(i), hit);
  const damage = await page.evaluate(
    () => (window as unknown as { __cart: { world(): { damage: number } } }).__cart.world().damage,
  );
  expect(damage).toBeGreaterThan(0);
  await expect(page.locator(".hud-tag")).not.toContainText("R$0.00");
});

test("the daily level: the first try counts, the next is practice", async ({ page }) => {
  await page.goto("/?test=1&level=daily&date=2026-11-20");
  await expect(page.locator(".hud-value").first()).toContainText("20 Nov 2026");
  await page.evaluate(() =>
    (window as unknown as { __cart: { playPar(): void } }).__cart.playPar(),
  );
  await expect(page.getByTestId("result-tag")).toContainText("Cart parked", { timeout: 10_000 });
  await expect(page.locator(".result-note")).toContainText("counts for today");
  await expect(page.getByTestId("share")).toContainText("Park the Cart · daily 20 Nov 2026");
  await page.getByTestId("again").click();
  await page.evaluate(() =>
    (window as unknown as { __cart: { playPar(): void } }).__cart.playPar(),
  );
  await expect(page.locator(".result-note")).toContainText("Practice");
});

test("a link can't choose the address players share", async ({ page }) => {
  await page.goto("/?test=1&site=https://evil.example/&level=01-seniors-space");
  await page.evaluate(() =>
    (window as unknown as { __cart: { playPar(): void } }).__cart.playPar(),
  );
  await expect(page.getByTestId("share")).not.toContainText("evil.example");
});

test("a test date override never reaches storage", async ({ page }) => {
  await page.goto("/?test=1&level=daily&date=2031-01-01");
  await page.evaluate(() =>
    (window as unknown as { __cart: { playPar(): void } }).__cart.playPar(),
  );
  await expect(page.getByTestId("result-tag")).toBeVisible({ timeout: 10_000 });
  const stored = await page.evaluate(() => localStorage.getItem("park-the-cart.v1") ?? "");
  expect(stored).not.toContain("2031-01-01");
});
