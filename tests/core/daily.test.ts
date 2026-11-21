import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  dailyLevel,
  dateKey,
  DAILY_BOUND_SECONDS,
  generateCandidate,
  isDateKey,
} from "../../src/core/daily";
import { decodeInputs } from "../../src/core/replay";
import { validateLevel } from "../../src/core/validate";
import { simulate } from "../../src/core/world";

function daysFrom(start: [number, number, number], n: number): string[] {
  const out: string[] = [];
  // Plain calendar arithmetic (tests may use Date; the core never does).
  const d = new Date(Date.UTC(start[0], start[1] - 1, start[2]));
  for (let i = 0; i < n; i++) {
    out.push(dateKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

describe("daily level", () => {
  it("formats and checks date keys", () => {
    expect(dateKey(2026, 1, 5)).toBe("2026-01-05");
    expect(isDateKey("2026-11-20")).toBe(true);
    expect(isDateKey("2026-13-01")).toBe(false);
    expect(isDateKey("20-11-2026")).toBe(false);
    expect(isDateKey("2026-11-20<x>")).toBe(false);
  });

  it("is the same for everyone on the same day, and different the next", () => {
    expect(dailyLevel("2026-11-20")).toEqual(dailyLevel("2026-11-20"));
    expect(generateCandidate("2026-11-20", 0)).not.toEqual(generateCandidate("2026-11-21", 0));
  });

  it("is valid and finishable with R$ 0 within the bound, for 300 consecutive days", () => {
    for (const key of daysFrom([2026, 11, 20], 300)) {
      const d = dailyLevel(key);
      expect(validateLevel(d.level).ok, key).toBe(true);
      expect(d.attempts, key).toBeLessThan(24); // never the fallback
      const world = simulate(d.level, "standard", decodeInputs(d.level.par!.inputs)!);
      expect(world.status, key).toBe("parked");
      expect(world.damage, key).toBe(0);
      expect(world.endTick / 120, key).toBeLessThanOrEqual(DAILY_BOUND_SECONDS);
    }
  }, 120_000);

  it("holds for random dates too (property)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2026, max: 2099 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        (y, m, day) => {
          const d = dailyLevel(dateKey(y, m, day));
          expect(d.attempts).toBeLessThan(24);
          expect(validateLevel(d.level).ok).toBe(true);
        },
      ),
      { numRuns: 60 },
    );
  }, 120_000);
});
