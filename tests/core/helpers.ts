import type { Level } from "../../src/core/level";
import type { Input } from "../../src/core/cart";

/** A small lot: one row of stalls at the top opening down, the corral in stall 5. */
export function testLevel(over: Partial<Level> = {}): Level {
  return {
    id: "test",
    size: [24, 14],
    seed: 1,
    spawn: { x: 4, y: 10, heading: 0 },
    corral: { row: 0, stall: 5 },
    surface: "dry",
    rows: [{ x: 1, y: 0, stalls: 8, opens: "down" }],
    cars: [],
    hazards: [],
    ...over,
  };
}

export const idle = (n: number): Input[] => new Array(n).fill({ push: 0, turn: 0, hold: false });
export const repeat = (input: Input, n: number): Input[] => new Array(n).fill(input);
