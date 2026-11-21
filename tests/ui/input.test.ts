import { describe, expect, it } from "vitest";
import { keysToInput, stickToInput } from "../../src/ui/input";

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
