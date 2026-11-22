import { describe, expect, it } from "vitest";
import { TICK_RATE } from "../../src/core/cart";
import { createWorld, simulate, step } from "../../src/core/world";
import { keysToDirection, keysToInput, pointToInput, stickToInput } from "../../src/ui/input";
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

describe("pointing where to go", () => {
  /** Hold these keys for `seconds` from a cart at (12, 7) facing `heading`; where it ends up. */
  const go = (
    keys: string[],
    heading: number,
    seconds: number,
    cart: "standard" | "rusty" = "standard",
  ) => {
    const level = testLevel({
      spawn: { x: 12, y: 7, heading },
      rows: [{ x: 1, y: 8.4, stalls: 8, opens: "up" }],
    });
    const w = createWorld(level, cart);
    const d = keysToDirection(new Set(keys));
    let reversing = false;
    for (let i = 0; i < seconds * TICK_RATE; i++) {
      const b = w.cart.body;
      const p = pointToInput(d.dx, d.dy, b.a, b.w, reversing);
      reversing = p.reversing;
      step(w, { push: p.push, turn: p.turn, hold: false });
    }
    return { dx: w.cart.body.x - 12, dy: w.cart.body.y - 7, a: w.cart.body.a };
  };
  const EAST = 0;
  const SOUTH = Math.PI / 2;

  it("reads the keys as a direction on screen", () => {
    expect(keysToDirection(new Set(["ArrowUp"]))).toEqual({ dx: 0, dy: -1 });
    expect(keysToDirection(new Set(["KeyD"]))).toEqual({ dx: 1, dy: 0 });
    const diagonal = keysToDirection(new Set(["KeyW", "KeyD"]));
    expect(diagonal.dx).toBeCloseTo(Math.SQRT1_2);
    expect(diagonal.dy).toBeCloseTo(-Math.SQRT1_2);
    expect(keysToDirection(new Set(["KeyA", "KeyD"]))).toEqual({ dx: 0, dy: 0 });
    expect(keysToDirection(new Set(["Space"]))).toEqual({ dx: 0, dy: 0 });
  });

  it("does nothing with nothing pressed", () => {
    expect(pointToInput(0, 0, 1, 0.5, false)).toEqual({ push: 0, turn: 0, reversing: false });
  });

  it("goes up the screen on up, whichever way the cart faces", () => {
    // Facing east: it turns north and goes. The cart only faced this way to begin with.
    const fromEast = go(["ArrowUp"], EAST, 4);
    expect(fromEast.dy).toBeLessThan(-2);
    // Facing south, up is behind it: it backs up the screen rather than turning round.
    const fromSouth = go(["ArrowUp"], SOUTH, 4);
    expect(fromSouth.dy).toBeLessThan(-1);
    expect(Math.abs(fromSouth.a - SOUTH)).toBeLessThan(0.6);
  });

  it("goes right on right and left on left when the cart faces down the screen", () => {
    // The case that feels backwards with classic steering.
    expect(go(["ArrowRight"], SOUTH, 4).dx).toBeGreaterThan(2);
    expect(go(["ArrowLeft"], SOUTH, 4).dx).toBeLessThan(-2);
  });

  it("goes diagonally on two keys", () => {
    const d = go(["ArrowUp", "ArrowRight"], EAST, 4);
    expect(d.dx).toBeGreaterThan(1.5);
    expect(d.dy).toBeLessThan(-1.5);
  });

  it("still leaves the bad wheel to the player: holding right drifts off line", () => {
    // The standard cart pulls right, which is down the screen when it faces east.
    const d = go(["ArrowRight"], EAST, 6);
    expect(d.dx).toBeGreaterThan(8);
    expect(d.dy).toBeGreaterThan(0.25);
    // But it's a drift to correct, not a spiral.
    expect(d.dy).toBeLessThan(d.dx * 0.5);
  });

  it("doesn't flip between forwards and backwards at the boundary", () => {
    // Pointing just past the reverse threshold, then just inside it: it keeps reversing.
    const a = pointToInput(Math.cos(2.3), Math.sin(2.3), 0, 0, false);
    expect(a.reversing).toBe(true);
    expect(a.push).toBeLessThanOrEqual(0);
    const b = pointToInput(Math.cos(2.0), Math.sin(2.0), 0, 0, true);
    expect(b.reversing).toBe(true);
    const c = pointToInput(Math.cos(2.0), Math.sin(2.0), 0, 0, false);
    expect(c.reversing).toBe(false);
  });

  it("turns on the spot before pushing when the cart points the wrong way", () => {
    const p = pointToInput(0, -1, 0, 0, false);
    expect(p.push).toBe(0);
    expect(p.turn).toBe(-1);
  });
});
