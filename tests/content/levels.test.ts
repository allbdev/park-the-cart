import { describe, expect, it } from "vitest";
import { LEVELS } from "../../src/content/levels";
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
});
