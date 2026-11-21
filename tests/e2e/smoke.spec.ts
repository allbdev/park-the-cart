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
