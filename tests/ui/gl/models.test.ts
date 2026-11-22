import { describe, expect, it } from "vitest";
import { CAR_COLOURS, CAR_MODELS, CAR_SPECS } from "../../../src/content/cars";
import { CART_IDS, CARTS } from "../../../src/content/carts";
import { LEVELS } from "../../../src/content/levels";
import { stallRect } from "../../../src/core/level";
import { STRIDE } from "../../../src/ui/gl/mesh";
import {
  cartModel,
  carHeight,
  carModel,
  coneModel,
  doorModel,
  levelModel,
  markModel,
  quadModel,
  ringModel,
} from "../../../src/ui/gl/models";

function bounds(d: Float32Array) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < d.length; i += STRIDE) {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k]!, d[i + k]!);
      hi[k] = Math.max(hi[k]!, d[i + k]!);
    }
  }
  return { lo, hi };
}

function sound(d: Float32Array): void {
  expect(d.length % (STRIDE * 3)).toBe(0);
  expect(d.every(Number.isFinite)).toBe(true);
  for (let i = 0; i < d.length; i += STRIDE) {
    const n = Math.hypot(d[i + 3]!, d[i + 4]!, d[i + 5]!);
    expect(n).toBeGreaterThan(0.99);
    expect(n).toBeLessThan(1.01);
  }
}

describe("3D models", () => {
  it.each(CAR_MODELS)("builds a %s the size of its collision box", (model) => {
    const spec = CAR_SPECS[model];
    for (const colour of CAR_COLOURS) {
      const d = carModel(model, colour);
      sound(d);
      const { lo, hi } = bounds(d);
      // Bumper to bumper is the physics length; only mirrors and tyres stick out sideways.
      expect(hi[0]! - lo[0]!).toBeCloseTo(spec.length, 1);
      expect(hi[0]!).toBeLessThanOrEqual(spec.length / 2 + 0.01);
      expect(hi[1]! - lo[1]!).toBeGreaterThanOrEqual(spec.width);
      expect(hi[1]! - lo[1]!).toBeLessThan(spec.width + 0.45);
      expect(lo[2]!).toBeGreaterThanOrEqual(-0.001);
      expect(hi[2]!).toBeGreaterThan(carHeight(model) - 0.1);
      expect(hi[2]!).toBeLessThan(carHeight(model) + 0.15);
    }
  });

  it("paints the manager's car black whatever the level says", () => {
    expect(Array.from(carModel("manager", "red"))).toEqual(
      Array.from(carModel("manager", "black")),
    );
    expect(Array.from(carModel("sedan", "red"))).not.toEqual(
      Array.from(carModel("sedan", "black")),
    );
  });

  it.each(CART_IDS)("builds the %s cart around its collision box", (id) => {
    const spec = CARTS[id];
    const m = cartModel(id);
    sound(m.solid);
    if (m.wire.length) sound(m.wire);
    const { lo, hi } = bounds(m.solid);
    expect(hi[0]! - lo[0]!).toBeGreaterThan(spec.length * 0.85);
    expect(hi[0]! - lo[0]!).toBeLessThan(spec.length + 0.2);
    expect(hi[1]! - lo[1]!).toBeGreaterThan(spec.width * 0.8);
    expect(hi[1]! - lo[1]!).toBeLessThan(spec.width + 0.12);
    expect(lo[2]!).toBeGreaterThanOrEqual(-0.001);
    expect(hi[2]!).toBeGreaterThan(0.5);
    expect(hi[2]!).toBeLessThan(1.2);
    // The handle is at the back.
    expect(-lo[0]!).toBeGreaterThanOrEqual(spec.length / 2 - 0.05);
  });

  it("gives wire baskets a mesh and the platform trolley none", () => {
    expect(cartModel("standard").wire.length).toBeGreaterThan(0);
    expect(cartModel("wholesale").wire.length).toBe(0);
    // Texture coordinates count wires, so they're never negative.
    const w = cartModel("standard").wire;
    for (let i = 0; i < w.length; i += STRIDE) {
      expect(w[i + 10]!).toBeGreaterThanOrEqual(0);
      expect(w[i + 11]!).toBeGreaterThanOrEqual(0);
    }
  });

  it("leaves the abandoned cart empty", () => {
    expect(cartModel("rusty").solid.length).toBeLessThan(cartModel("standard").solid.length);
  });

  it("stands a cone up and lays it down", () => {
    const up = bounds(coneModel(false));
    const down = bounds(coneModel(true));
    sound(coneModel(false));
    sound(coneModel(true));
    expect(up.hi[2]!).toBeCloseTo(0.63, 1);
    expect(down.hi[2]!).toBeLessThan(0.45);
    expect(down.hi[0]! - down.lo[0]!).toBeGreaterThan(0.55);
    expect(down.lo[2]!).toBeGreaterThanOrEqual(-0.06);
  });

  it("builds a door from its collision box", () => {
    const d = doorModel("red", 0.5, 0.04);
    sound(d);
    const { lo, hi } = bounds(d);
    expect(hi[0]! - lo[0]!).toBeCloseTo(1, 1);
    expect(hi[2]!).toBeGreaterThan(1.2);
  });

  it("builds the flat helpers at unit size", () => {
    for (const d of [ringModel(), markModel(), quadModel()]) sound(d);
    expect(bounds(quadModel()).hi[0]).toBe(0.5);
    expect(bounds(markModel()).hi[0]).toBeCloseTo(1);
  });

  it.each(LEVELS.map((l) => [l.level.id, l.level] as const))(
    "builds the lot for %s",
    (_id, level) => {
      const m = levelModel(level);
      sound(m.solid);
      sound(m.ground);
      sound(m.sign);
      const [W, H] = level.size;
      const g = bounds(m.ground);
      expect(g.lo.slice(0, 2)).toEqual([0, 0]);
      expect(g.hi.slice(0, 2)).toEqual([W, H]);
      expect(m.ground.length).toBe(6 * STRIDE);
      // The sign stands over the corral's stall, above head height.
      const r = stallRect(level.rows[level.corral.row]!, level.corral.stall);
      const s = bounds(m.sign);
      expect(s.lo[0]!).toBeGreaterThanOrEqual(r.x);
      expect(s.hi[0]!).toBeLessThanOrEqual(r.x + r.w);
      expect(s.lo[1]!).toBeGreaterThanOrEqual(r.y);
      expect(s.hi[1]!).toBeLessThanOrEqual(r.y + r.h);
      expect(s.lo[2]!).toBeGreaterThan(1.3);
    },
  );

  it("is the same lot every time", () => {
    const level = LEVELS[2]!.level;
    expect(Array.from(levelModel(level).solid)).toEqual(Array.from(levelModel(level).solid));
  });

  it("raises a hump where the level has a speed bump", () => {
    const withBump = LEVELS.find((l) => l.level.hazards.some((h) => h.type === "speedBump"))!.level;
    const flat = { ...withBump, hazards: withBump.hazards.filter((h) => h.type !== "speedBump") };
    expect(levelModel(withBump).solid.length).toBeGreaterThan(levelModel(flat).solid.length);
  });
});
