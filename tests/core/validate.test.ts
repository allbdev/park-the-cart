import { describe, expect, it } from "vitest";
import { validateLevel } from "../../src/core/validate";
import { testLevel } from "./helpers";

const errorsOf = (raw: unknown) => {
  const v = validateLevel(raw);
  return v.ok ? [] : v.errors;
};

describe("level validator", () => {
  it("accepts a good level", () => {
    expect(validateLevel(testLevel()).ok).toBe(true);
  });

  it("rejects things that aren't levels", () => {
    expect(errorsOf(null)).toEqual(["level is not an object"]);
    expect(errorsOf([])).toEqual(["level is not an object"]);
    expect(errorsOf({})).toContain("bad id");
  });

  it("rejects unknown hazards, models and colours", () => {
    expect(errorsOf(testLevel({ hazards: [{ type: "lava" } as never] }))).toContain(
      "hazard 0: unknown type",
    );
    expect(
      errorsOf(testLevel({ cars: [{ row: 0, stall: 1, model: "tank" as never, colour: "red" }] })),
    ).toContain("car 0: unknown model");
    expect(
      errorsOf(
        testLevel({ cars: [{ row: 0, stall: 1, model: "sedan", colour: "pink" as never }] }),
      ),
    ).toContain("car 0: unknown colour");
  });

  it("rejects two cars in a stall and a car in the corral", () => {
    expect(
      errorsOf(
        testLevel({
          cars: [
            { row: 0, stall: 1, model: "sedan", colour: "red" },
            { row: 0, stall: 1, model: "hatch", colour: "blue" },
          ],
        }),
      ),
    ).toContain("car 1: stall taken");
    expect(
      errorsOf(testLevel({ cars: [{ row: 0, stall: 5, model: "sedan", colour: "red" }] })),
    ).toContain("car 0: stall taken");
  });

  it("rejects a stall that doesn't exist and a row outside the lot", () => {
    expect(
      errorsOf(testLevel({ cars: [{ row: 0, stall: 99, model: "sedan", colour: "red" }] })),
    ).toContain("car 0: not a stall");
    expect(errorsOf(testLevel({ rows: [{ x: 1, y: 0, stalls: 30, opens: "down" }] }))).toContain(
      "row 0: outside the lot",
    );
  });

  it("rejects a spawn inside a car and a cone inside a wall", () => {
    const lvl = testLevel({ cars: [{ row: 0, stall: 1, model: "sedan", colour: "red" }] });
    expect(errorsOf({ ...lvl, spawn: { x: 4.6, y: 2.6, heading: 0 } })).toContain(
      "spawn overlaps something solid",
    );
    expect(
      errorsOf(testLevel({ hazards: [{ type: "cone", x: 4.6, y: 2.6 }], cars: lvl.cars })),
    ).toContain("hazard 0: cone inside something");
  });

  it("rejects two winds and bad numbers", () => {
    expect(
      errorsOf(
        testLevel({
          hazards: [
            { type: "wind", dir: 0, accel: 1 },
            { type: "wind", dir: 1, accel: 1 },
          ],
        }),
      ),
    ).toContain("more than one wind");
    expect(errorsOf(testLevel({ hazards: [{ type: "cone", x: NaN, y: 1 }] }))).toContain(
      "hazard 0: bad x",
    );
  });
});
