import { describe, expect, it } from "vitest";
import { compareResults, isBetter, receiptItems, type Result } from "../../src/core/result";
import type { ReceiptLine } from "../../src/core/world";

const r = (damage: number, ticks: number, parked = true): Result => ({
  level: "x",
  cart: "standard",
  parked,
  damage,
  ticks,
  lines: 0,
});

describe("results", () => {
  it("rank by damage first, then time", () => {
    expect(compareResults(r(0, 5000), r(100, 100))).toBeLessThan(0);
    expect(compareResults(r(100, 90), r(100, 100))).toBeLessThan(0);
    expect(compareResults(r(100, 100), r(100, 100))).toBe(0);
  });

  it("only count parked runs as a best", () => {
    expect(isBetter(r(0, 10, false), null)).toBe(false);
    expect(isBetter(r(500, 10), null)).toBe(true);
    expect(isBetter(r(500, 10), r(0, 10, false))).toBe(true);
    expect(isBetter(r(500, 10), r(400, 900))).toBe(false);
    expect(isBetter(r(0, 10), r(400, 900))).toBe(true);
  });

  it("group cones on the receipt and keep car lines apart", () => {
    const lines: ReceiptLine[] = [
      {
        kind: "car",
        zone: "door",
        car: 0,
        model: "sedan",
        colour: "silver",
        price: 184000,
        tick: 10,
      },
      { kind: "cone", price: 3400, tick: 20 },
      {
        kind: "car",
        zone: "mirror",
        car: 1,
        model: "suv",
        colour: "black",
        price: 62000,
        tick: 30,
      },
      { kind: "cone", price: 3400, tick: 40 },
      { kind: "cone", price: 3400, tick: 50 },
    ];
    const items = receiptItems(lines);
    expect(items.map((i) => i.kind)).toEqual(["car", "cone", "car"]);
    expect(items[1]).toEqual({ kind: "cone", count: 3, unit: 3400, price: 10200 });
  });
});
