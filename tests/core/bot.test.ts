import { describe, expect, it } from "vitest";
import { findPar, planPath } from "../../src/core/bot";
import { createWorld, simulate } from "../../src/core/world";
import { testLevel } from "./helpers";

const level = testLevel({
  cars: [
    { row: 0, stall: 3, model: "sedan", colour: "red" },
    { row: 0, stall: 6, model: "suv", colour: "black" },
  ],
  hazards: [{ type: "cone", x: 10, y: 9 }],
});

describe("parking bot", () => {
  it("plans a path that ends in the corral", () => {
    const world = createWorld(level, "standard");
    const path = planPath(world, 0.5)!;
    const [x, y] = path[path.length - 1]!;
    const c = world.corral;
    expect(x).toBeGreaterThan(c.x);
    expect(x).toBeLessThan(c.x + c.w);
    expect(y).toBeGreaterThan(c.y);
    expect(y).toBeLessThan(c.y + c.h);
  });

  it("returns null when the corral is walled off", () => {
    const blocked = testLevel({
      hazards: [{ type: "island", x: 0, y: 6.2, w: 24, h: 0.6 }],
    });
    expect(planPath(createWorld(blocked, "standard"), 0.5)).toBeNull();
  });

  it("parks with R$ 0, and its inputs replay to the same result", () => {
    const run = findPar(level)!;
    expect(run.world.status).toBe("parked");
    expect(run.world.damage).toBe(0);
    const again = simulate(level, "standard", run.inputs);
    expect(again.endTick).toBe(run.world.endTick);
  });
});
