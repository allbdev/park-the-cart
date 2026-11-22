import { describe, expect, it } from "vitest";
import { TICK_RATE } from "../../src/core/cart";
import { simulate } from "../../src/core/world";
import { keysToInput, stickToInput } from "../../src/ui/input";
import { testLevel } from "../core/helpers";

describe("keyboard", () => {
  it("maps WASD and arrows", () => {
    expect(keysToInput(new Set(["KeyW"]))).toEqual({ push: 1, turn: 0, hold: false });
    expect(keysToInput(new Set(["ArrowDown"]))).toEqual({ push: -1, turn: 0, hold: false });
    expect(keysToInput(new Set(["ArrowUp", "KeyA"]))).toEqual({ push: 1, turn: -1, hold: false });
    expect(keysToInput(new Set(["KeyD", "Space"]))).toEqual({ push: 0, turn: 1, hold: true });
  });

  it("cancels opposite keys", () => {
    expect(keysToInput(new Set(["KeyA", "KeyD"])).turn).toBe(0);
    expect(keysToInput(new Set(["KeyW", "KeyS"])).push).toBe(0);
  });
});

describe("touch stick", () => {
  it("has a dead zone and reaches full range", () => {
    expect(stickToInput(0.05, -0.05, false)).toEqual({ push: 0, turn: 0, hold: false });
    expect(stickToInput(1, -1, true)).toEqual({ push: 1, turn: 1, hold: true });
    const half = stickToInput(0, -0.56, false);
    expect(half.push).toBeCloseTo(0.5, 1);
  });

  it("pulls back when dragged down", () => {
    expect(stickToInput(0, 1, false).push).toBe(-1);
  });
});

describe("steering while pulling back", () => {
  const level = testLevel({ spawn: { x: 12, y: 10, heading: 0 } });
  /** Where the cart ends up after two seconds of these keys, relative to where it started. */
  const drive = (keys: string[]) => {
    const input = keysToInput(new Set(keys));
    const w = simulate(level, "standard", new Array(2 * TICK_RATE).fill(input));
    return { dx: w.cart.body.x - 12, dy: w.cart.body.y - 10 };
  };

  it("mirrors the turn so left still means left", () => {
    expect(keysToInput(new Set(["KeyS", "KeyA"]))).toEqual({ push: -1, turn: 1, hold: false });
    expect(keysToInput(new Set(["ArrowDown", "ArrowRight"]))).toEqual({
      push: -1,
      turn: -1,
      hold: false,
    });
    expect(keysToInput(new Set(["KeyS"])).turn).toBe(0);
    // Forward and standing still are untouched.
    expect(keysToInput(new Set(["KeyW", "KeyA"])).turn).toBe(-1);
    expect(keysToInput(new Set(["KeyA"])).turn).toBe(-1);
    const back = stickToInput(-1, 1, false);
    expect(back).toEqual({ push: -1, turn: 1, hold: false });
    expect(stickToInput(-1, -1, false).turn).toBe(-1);
  });

  it("sends the cart back and to the left on back + left (the cart faces east: left is north)", () => {
    // Heading 0 is +x and y grows downwards, so the cart's left is -y.
    const left = drive(["KeyS", "KeyA"]);
    expect(left.dx).toBeLessThan(-0.3);
    expect(left.dy).toBeLessThan(-0.05);
    const right = drive(["KeyS", "KeyD"]);
    expect(right.dx).toBeLessThan(-0.3);
    expect(right.dy).toBeGreaterThan(0.05);
  });

  it("still sends it forward and to the left on push + left", () => {
    const left = drive(["KeyW", "KeyA"]);
    expect(left.dx).toBeGreaterThan(0.3);
    expect(left.dy).toBeLessThan(-0.05);
  });
});
