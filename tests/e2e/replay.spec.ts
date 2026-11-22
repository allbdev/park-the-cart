import { readFileSync } from "node:fs";
import { open } from "./helpers";
import { expect, test } from "@playwright/test";
import { encodeReplay } from "../../src/core/replay";
import { simulate } from "../../src/core/world";
import type { Level } from "../../src/core/level";
import type { Input } from "../../src/core/cart";

const level = JSON.parse(readFileSync("src/content/levels/10-rush-hour.json", "utf8")) as Level;

/** A messy run: weaving, holding, crashing. Exercises every hazard path in the level. */
function messyInputs(): Input[] {
  const out: Input[] = [];
  for (let i = 0; i < 120 * 40; i++) {
    const phase = Math.floor(i / 90) % 7;
    out.push({
      push: phase === 5 ? -0.5 : 1,
      turn: [0, 1, -1, 0.5, -0.25, 0, 1][phase]!,
      hold: phase === 6,
    });
  }
  return out;
}

type ReplayHooks = {
  __cart: { replayEnd(): { x: number; y: number; a: number; tick: number; damage: number } };
};

test("a replay link plays the same run, to the last bit, as in Node", async ({ page }) => {
  const inputs = messyInputs();
  const expected = simulate(level, "standard", inputs);
  const link = encodeReplay({ level: level.id, cart: "standard", inputs });
  await open(page, `/?test=1#r=${link}`);
  await expect(page.getByTestId("replay-title")).toContainText("Rush Hour");
  const got = await page.evaluate(() => (window as unknown as ReplayHooks).__cart.replayEnd());
  expect(got).toEqual({
    x: expected.cart.body.x,
    y: expected.cart.body.y,
    a: expected.cart.body.a,
    tick: expected.tick,
    damage: expected.damage,
  });
});

test("a broken replay link shows a message, not an error", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await open(page, "/?test=1#r=v1.<script>alert(1)</script>.standard.AAAA");
  await expect(page.getByRole("alert")).toContainText("broken");
  await expect(page.locator("script:not([type=module]):not([src])")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("watch the replay from the result screen", async ({ page }) => {
  await open(page, "/?test=1&level=01-seniors-space");
  await page.evaluate(() =>
    (window as unknown as { __cart: { playPar(): void } }).__cart.playPar(),
  );
  await page.getByTestId("watch-replay").click();
  await expect(page.getByTestId("replay-title")).toContainText("Seniors");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("result-tag")).toBeVisible();
});
