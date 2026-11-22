import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";
import { readFileSync } from "node:fs";
import { decodeInputs } from "../../src/core/replay";

const level1 = JSON.parse(readFileSync("src/content/levels/01-seniors-space.json", "utf8")) as {
  par: { inputs: string };
};

type Hooks = { __cart: { playInputs(i: unknown[]): void } };

/** "3d", "flat", and whether this browser could do 3D at all. */
async function renderer(page: Page): Promise<{ kind: "3d" | "flat"; webgl2: boolean }> {
  return page.evaluate(() => {
    const lot = document.querySelector<HTMLCanvasElement>("canvas.lot")!;
    // A canvas that already has a WebGL context refuses to hand out a 2D one.
    const kind = lot.getContext("2d") === null ? "3d" : "flat";
    return { kind, webgl2: !!document.createElement("canvas").getContext("webgl2") };
  });
}

test("the lot is drawn in 3D wherever WebGL 2 works, and it isn't blank", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await open(page, "/?test=1&level=03-speed-bump");
  await expect(page.locator("canvas.lot")).toBeVisible();
  const r = await renderer(page);
  expect(r.kind).toBe(r.webgl2 ? "3d" : "flat");
  // A blank canvas compresses to almost nothing; a car park doesn't.
  await page.waitForTimeout(300);
  const shot = await page.locator("canvas.lot").screenshot();
  expect(shot.length).toBeGreaterThan(40_000);
  expect(errors).toEqual([]);
});

test("the flat renderer still plays a level", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await open(page, "/?test=1&gfx=flat&level=01-seniors-space");
  await expect(page.locator("canvas.lot")).toBeVisible();
  expect((await renderer(page)).kind).toBe("flat");
  const shot = await page.locator("canvas.lot").screenshot();
  expect(shot.length).toBeGreaterThan(40_000);
  const inputs = decodeInputs(level1.par.inputs)!;
  await page.evaluate((i) => (window as unknown as Hooks).__cart.playInputs(i), inputs);
  await expect(page.getByTestId("result-tag")).toContainText("Cart parked", { timeout: 10_000 });
  expect(errors).toEqual([]);
});

test("a hit pops its price tag on screen, next to the cart", async ({ page }) => {
  await open(page, "/?test=1&level=03-speed-bump");
  await expect(page.locator("canvas.lot")).toBeVisible();
  const inputs = Array.from({ length: 330 }, (_, i) => ({
    push: 1,
    turn: i < 60 ? 1 : 0,
    hold: false,
  }));
  // Read the tag in the same breath as the hit: it only stays up for a moment.
  const box = await page.evaluate((i) => {
    (window as unknown as Hooks).__cart.playInputs(i);
    const r = document.querySelector(".price-pop")?.getBoundingClientRect();
    return r ? { x: r.x, y: r.y, w: r.width } : null;
  }, inputs);
  expect(box).not.toBeNull();
  const view = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x).toBeLessThan(view.width);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeLessThan(view.height);
});

test("level select shows a picture of every level", async ({ page }) => {
  await open(page, "/?test=1");
  await page.evaluate(() =>
    localStorage.setItem(
      "park-the-cart.v1",
      JSON.stringify({ locale: "en", finished: 3, cart: "standard", best: {}, daily: {} }),
    ),
  );
  await page.reload();
  await page.getByTestId("play").click();
  const thumbs = page.locator("canvas.thumb");
  await expect(thumbs).toHaveCount(10);
  // Each thumbnail is a copy of a rendered frame, not an empty canvas.
  const filled = await thumbs.evaluateAll((els) =>
    els.map((el) => {
      const c = el as HTMLCanvasElement;
      const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      let lit = 0;
      for (let i = 0; i < d.length; i += 40) if (d[i]! + d[i + 1]! + d[i + 2]! > 90) lit++;
      return lit;
    }),
  );
  for (const n of filled) expect(n).toBeGreaterThan(100);
});
