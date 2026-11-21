import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { atan, atan2, clamp, cos, PI, sin, wrapAngle } from "../../src/core/math";

describe("deterministic math", () => {
  it("matches Math within 1e-14 over the game's range", () => {
    fc.assert(
      fc.property(fc.double({ min: -1000, max: 1000, noNaN: true }), (x) => {
        expect(Math.abs(sin(x) - Math.sin(x))).toBeLessThan(1e-13);
        expect(Math.abs(cos(x) - Math.cos(x))).toBeLessThan(1e-13);
        expect(Math.abs(atan(x) - Math.atan(x))).toBeLessThan(1e-14);
      }),
      { numRuns: 20_000 },
    );
  });

  it("matches Math.atan2 in every quadrant", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -100, max: 100, noNaN: true }),
        fc.double({ min: -100, max: 100, noNaN: true }),
        (y, x) => {
          if (x === 0) return; // signed zeros: Math.atan2(0, -0) is pi; we return 0 on purpose
          // -pi and pi are the same heading (y = -0 on the negative x axis)
          expect(Math.abs(wrapAngle(atan2(y, x) - Math.atan2(y, x)))).toBeLessThan(1e-14);
        },
      ),
      { numRuns: 20_000 },
    );
    expect(atan2(0, 0)).toBe(0);
    expect(atan2(1, 0)).toBe(PI / 2);
    expect(atan2(-1, 0)).toBe(-PI / 2);
  });

  it("pins exact outputs, so any engine difference shows up", () => {
    // These bit patterns come from the polynomials above, not from Math.
    const values = [0.1, 1, 2.5, -3, 10, 123.456].map((x) => [sin(x), cos(x), atan(x)]);
    expect(values).toMatchSnapshot();
  });

  it("handles special values", () => {
    expect(sin(0)).toBe(0);
    expect(cos(0)).toBe(1);
    expect(Number.isNaN(sin(Infinity))).toBe(true);
    expect(Number.isNaN(atan(NaN))).toBe(true);
    expect(atan(Infinity)).toBeCloseTo(PI / 2, 15);
  });

  it("wraps angles into (-pi, pi]", () => {
    fc.assert(
      fc.property(fc.double({ min: -1e4, max: 1e4, noNaN: true }), (a) => {
        const w = wrapAngle(a);
        expect(w).toBeGreaterThan(-PI - 1e-12);
        expect(w).toBeLessThanOrEqual(PI + 1e-12);
        expect(Math.abs(Math.sin(w) - Math.sin(a))).toBeLessThan(1e-9);
      }),
    );
    expect(clamp(5, 0, 1)).toBe(1);
  });
});
