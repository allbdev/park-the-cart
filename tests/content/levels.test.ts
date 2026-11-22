import { describe, expect, it } from "vitest";
import { LEVELS } from "../../src/content/levels";
import cartPars from "./cart-pars.json";
import { TICK_RATE } from "../../src/core/cart";
import { decodeInputs } from "../../src/core/replay";
import { validateLevel } from "../../src/core/validate";
import { simulate } from "../../src/core/world";

describe("the ten levels", () => {
  it("are numbered 1 to 10 with unique ids", () => {
    expect(LEVELS.map((l) => l.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(new Set(LEVELS.map((l) => l.level.id)).size).toBe(10);
  });

  for (const entry of LEVELS) {
    describe(entry.level.id, () => {
      it("passes the validator", () => {
        const v = validateLevel(entry.level);
        expect(v.ok ? [] : v.errors).toEqual([]);
      });

      it("is finished with R$ 0 by its par run (npm run record-par to re-record)", () => {
        const par = entry.level.par;
        expect(par, "no par run").toBeDefined();
        const inputs = decodeInputs(par!.inputs);
        expect(inputs).not.toBeNull();
        const world = simulate(entry.level, "standard", inputs!);
        expect(world.status).toBe("parked");
        expect(world.damage).toBe(0);
        expect(world.endTick / TICK_RATE).toBeLessThan(60);
      });
    });
  }

  it("introduce their hazards in order", () => {
    const has = (n: number, type: string) =>
      LEVELS[n - 1]!.level.hazards.some((h) => h.type === type);
    expect(has(3, "speedBump") && has(3, "cone")).toBe(true);
    expect(has(4, "cart")).toBe(true);
    expect(has(5, "slope")).toBe(true);
    expect(has(6, "wind")).toBe(true);
    expect(LEVELS[6]!.level.surface).toBe("wet");
    expect(LEVELS[7]!.level.cars.some((c) => c.door)).toBe(true);
    expect(LEVELS[8]!.level.cars.some((c) => c.model === "manager")).toBe(true);
    expect(LEVELS[9]!.level.cars.some((c) => c.reverse)).toBe(true);
  });

  it("give every level a card limit, tighter each time", () => {
    const limits = LEVELS.map((l) => l.level.limit);
    for (const [i, limit] of limits.entries()) {
      expect(limit, `level ${i + 1}`).toBeDefined();
      if (i > 0) expect(limit!).toBeLessThan(limits[i - 1]!);
    }
    // The last one forgives a few cones and nothing else.
    expect(limits[9]!).toBeLessThan(62_000);
  });

  it("bring in traffic from level 6 and never ease off", () => {
    const count = (n: number, type: string) =>
      LEVELS[n - 1]!.level.hazards.filter((h) => h.type === type).length;
    for (let n = 1; n <= 5; n++) expect(count(n, "traffic"), `level ${n}`).toBe(0);
    for (let n = 6; n <= 10; n++) expect(count(n, "traffic"), `level ${n}`).toBeGreaterThan(0);
    expect(count(4, "cart")).toBeGreaterThan(1);
    for (const l of LEVELS) expect(l.level.cars.length, l.level.id).toBeGreaterThan(12);
  });

  // Carts unlock by finishing every level with the cart before, so every cart that gates
  // another must be able to. The bot's runs for them are recorded by `npm run make-levels`.
  describe.each(["rusty", "basket", "kiddie"] as const)("with the %s cart", (cart) => {
    it.each(LEVELS.map((l) => [l.level.id, l.level] as const))(
      "%s can be parked with R$ 0",
      (id, level) => {
        const encoded = (cartPars as Record<string, Record<string, string>>)[id]?.[cart];
        expect(encoded, "no recorded run: npm run make-levels").toBeDefined();
        const world = simulate(level, cart, decodeInputs(encoded!)!);
        expect(world.status).toBe("parked");
        expect(world.damage).toBe(0);
      },
    );
  });
});
