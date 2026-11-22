import { describe, expect, it } from "vitest";
import { findPar, planPath } from "../../src/core/bot";
import { TICK_RATE } from "../../src/core/cart";
import type { Hazard } from "../../src/core/level";
import { receiptItems } from "../../src/core/result";
import { validateLevel } from "../../src/core/validate";
import { createWorld, simulate, step, type World } from "../../src/core/world";
import { idle, repeat, testLevel } from "./helpers";

const PUSH = { push: 1, turn: 0, hold: false };
const IDLE = idle(1)[0]!;

/** A car crossing the test lot (24 m wide) at y = 9, eastbound, 4 m/s, back every 5 s. */
const traffic = (over: Partial<Extract<Hazard, { type: "traffic" }>> = {}): Hazard => ({
  type: "traffic",
  y: 9,
  dir: 1,
  speed: 4,
  gap: 5,
  model: "sedan",
  colour: "red",
  ...over,
});

function place(world: World, x: number, y: number): void {
  world.cart.body.x = x;
  world.cart.body.y = y;
}

describe("the card limit", () => {
  const level = testLevel({
    limit: 100_000,
    cars: [{ row: 0, stall: 2, model: "sedan", colour: "silver" }],
    hazards: [
      { type: "cone", x: 5, y: 10 },
      { type: "cone", x: 5.5, y: 10 },
    ],
  });

  it("lets damage up to the limit pass", () => {
    const w = simulate(level, "standard", repeat(PUSH, 400));
    expect(w.receipt.length).toBe(2);
    expect(w.damage).toBe(6_800);
    expect(w.status).toBe("playing");
    expect(w.failReason).toBeNull();
  });

  it("fails the run the moment the receipt goes over it", () => {
    const w = createWorld(level, "standard");
    const car = w.cars[0]!.body;
    place(w, car.x + car.hy + 0.9, car.y);
    w.cart.body.vx = -2;
    for (let i = 0; i < 120 && w.status === "playing"; i++) step(w, IDLE);
    expect(w.damage).toBe(184_000);
    expect(w.status).toBe("failed");
    expect(w.failReason).toBe("limit");
    expect(w.endTick).toBeGreaterThan(0);
    // Nothing moves once it's over.
    const tick = w.tick;
    step(w, PUSH);
    expect(w.tick).toBe(tick);
  });

  it("means nothing on a level without one", () => {
    const free = { ...level, limit: undefined };
    const w = createWorld(free, "standard");
    const car = w.cars[0]!.body;
    place(w, car.x + car.hy + 0.9, car.y);
    w.cart.body.vx = -2;
    for (let i = 0; i < 120; i++) step(w, IDLE);
    expect(w.damage).toBe(184_000);
    expect(w.status).toBe("playing");
  });

  it("with a limit of zero, one cone is too much", () => {
    const w = simulate({ ...level, limit: 0 }, "standard", repeat(PUSH, 400));
    expect(w.status).toBe("failed");
    expect(w.damage).toBe(3_400);
  });

  it("says the manager's car when that's what ended it", () => {
    const boss = testLevel({
      limit: 0,
      cars: [{ row: 0, stall: 2, model: "manager", colour: "black" }],
    });
    const w = createWorld(boss, "standard");
    const car = w.cars[0]!.body;
    place(w, car.x + car.hy + 0.6, car.y);
    w.cart.body.vx = -2;
    for (let i = 0; i < 120 && w.status === "playing"; i++) step(w, IDLE);
    expect(w.status).toBe("failed");
    expect(w.failReason).toBe("manager");
  });
});

describe("traffic", () => {
  const level = testLevel({ hazards: [traffic()] });

  it("drives across the lot, leaves, and comes round again", () => {
    const w = createWorld(level, "standard");
    place(w, 2, 12.5);
    const car = w.cars[0]!;
    const xs: number[] = [];
    for (let i = 0; i < 20 * TICK_RATE; i++) {
      step(w, IDLE);
      if (i % (TICK_RATE / 2) === 0) xs.push(Math.round(car.body.x));
    }
    // Sedan 4.5 m: starts at -3.25, crosses 30.5 m in about 7.6 s, away 5 s, repeat.
    expect(xs[0]).toBe(-3);
    expect(xs[2]).toBe(1);
    expect(Math.max(...xs)).toBeGreaterThan(24);
    expect(xs.filter((x) => x < -100).length).toBeGreaterThan(5);
    // The second pass starts where the first did, one cycle (7.625 s + 5 s) later.
    const again = createWorld(level, "standard");
    place(again, 2, 12.5);
    for (let i = 0; i <= 12.625 * TICK_RATE; i++) step(again, IDLE);
    expect(again.cars[0]!.body.x).toBeCloseTo(-3.25, 1);
    expect(car.body.y).toBe(9);
  });

  it("starts part-way through its cycle with an offset", () => {
    const a = createWorld(testLevel({ hazards: [traffic({ offset: 2 })] }), "standard");
    expect(a.cars[0]!.body.x).toBeCloseTo(-3.25 + 8);
    const west = createWorld(testLevel({ hazards: [traffic({ dir: -1 })] }), "standard");
    expect(west.cars[0]!.body.x).toBeCloseTo(24 + 3.25);
    step(west, IDLE);
    step(west, IDLE);
    expect(west.cars[0]!.body.x).toBeLessThan(24 + 3.25);
  });

  it("bills a cart in its way once per pass, and shoves it along", () => {
    const w = createWorld(level, "standard");
    place(w, 10, 9);
    for (let i = 0; i < 6 * TICK_RATE; i++) step(w, IDLE);
    expect(w.receipt.map((l) => l.kind)).toEqual(["traffic"]);
    expect(w.damage).toBe(390_000);
    expect(w.cart.body.x).toBeGreaterThan(11);
    expect(receiptItems(w.receipt)[0]).toMatchObject({
      kind: "traffic",
      model: "sedan",
      colour: "red",
    });
  });

  it("leaves a cart alone that stays out of its lane", () => {
    const w = createWorld(level, "standard");
    place(w, 10, 12);
    for (let i = 0; i < 20 * TICK_RATE; i++) step(w, IDLE);
    expect(w.damage).toBe(0);
  });

  it("doesn't put abandoned carts on the player's receipt for being run over", () => {
    const w = createWorld(
      testLevel({ hazards: [traffic(), { type: "cart", x: 10, y: 9, heading: 1 }] }),
      "standard",
    );
    place(w, 2, 12.5);
    for (let i = 0; i < 6 * TICK_RATE; i++) step(w, IDLE);
    expect(w.loose[0]!.x).toBeGreaterThan(10.5);
    expect(w.receipt.filter((l) => l.kind === "traffic")).toEqual([]);
  });

  it("is the same every run", () => {
    const inputs = [...repeat(PUSH, 500), ...repeat({ push: 0.5, turn: 1, hold: false }, 400)];
    const a = simulate(level, "standard", inputs);
    const b = simulate(level, "standard", inputs);
    expect([a.cart.body.x, a.cart.body.y, a.damage, a.cars[0]!.body.x]).toEqual([
      b.cart.body.x,
      b.cart.body.y,
      b.damage,
      b.cars[0]!.body.x,
    ]);
  });

  it("is checked by the validator", () => {
    expect(validateLevel(level).ok).toBe(true);
    for (const bad of [
      { dir: 0 },
      { speed: 0 },
      { speed: 50 },
      { gap: -1 },
      { model: "tank" },
      { colour: "pink" },
      { offset: "soon" },
    ])
      expect(
        validateLevel(testLevel({ hazards: [traffic(bad as never)] })).ok,
        JSON.stringify(bad),
      ).toBe(false);
    expect(validateLevel(testLevel({ limit: 1.5 })).ok).toBe(false);
    expect(validateLevel(testLevel({ limit: -1 })).ok).toBe(false);
    expect(validateLevel(testLevel({ limit: 0 })).ok).toBe(true);
  });
});

describe("several abandoned carts", () => {
  const level = testLevel({
    hazards: [
      { type: "cart", x: 5.6, y: 10, heading: 0 },
      { type: "cart", x: 12, y: 10, heading: 1 },
      { type: "cart", x: 16, y: 6, heading: 2 },
    ],
  });

  it("puts every one of them on the lot", () => {
    const w = createWorld(level, "standard");
    expect(w.loose.map((l) => l.x)).toEqual([5.6, 12, 16]);
  });

  it("lets the player shove them, for free", () => {
    const w = simulate(level, "standard", repeat(PUSH, 700));
    expect(w.loose[0]!.x).toBeGreaterThan(5.9);
    expect(w.loose[2]!.x).toBe(16);
    expect(w.damage).toBe(0);
  });

  it("blows them all along in the wind", () => {
    const windy = {
      ...level,
      hazards: [...level.hazards, { type: "wind" as const, dir: 0, accel: 1.5 }],
    };
    const w = createWorld(windy, "standard");
    place(w, 2, 12.5);
    for (let i = 0; i < 8 * TICK_RATE; i++) step(w, { push: 0, turn: 0, hold: true });
    for (const [i, x] of [5.6, 12, 16].entries()) expect(w.loose[i]!.x).toBeGreaterThan(x + 0.3);
  });
});

describe("whose fault an abandoned cart is", () => {
  // A cart rolling down a slope into a parked car, with nobody near it.
  const level = testLevel({
    rows: [{ x: 1, y: 8.4, stalls: 8, opens: "up" }],
    corral: { row: 0, stall: 7 },
    spawn: { x: 20, y: 2, heading: 0 },
    cars: [{ row: 0, stall: 1, model: "sedan", colour: "blue" }],
    hazards: [
      { type: "slope", x: 0, y: 0, w: 24, h: 14, dir: Math.PI / 2, accel: 2 },
      { type: "cart", x: 4.9, y: 3, heading: Math.PI / 2 },
    ],
  });
  const HOLD = { push: 0, turn: 0, hold: true };

  it("isn't the player's while nobody has pushed it", () => {
    const w = createWorld(level, "standard");
    for (let i = 0; i < 8 * TICK_RATE; i++) step(w, HOLD);
    // It did roll into the car.
    expect(w.loose[0]!.y).toBeGreaterThan(6);
    expect(w.pushed).toEqual([false]);
    expect(w.receipt).toEqual([]);
  });

  it("is the player's from the first push", () => {
    const w = createWorld(level, "standard");
    w.pushed[0] = true;
    for (let i = 0; i < 8 * TICK_RATE; i++) step(w, HOLD);
    expect(w.receipt.length).toBeGreaterThan(0);
    expect(w.receipt[0]).toMatchObject({ kind: "car", model: "sedan" });
  });

  it("marks a cart as pushed when the player's cart touches it", () => {
    const flat = testLevel({ hazards: [{ type: "cart", x: 5.6, y: 10, heading: 0 }] });
    const w = simulate(flat, "standard", repeat(PUSH, 300));
    expect(w.pushed).toEqual([true]);
  });
});

describe("the bot in traffic", () => {
  // The corral is in the top row and the cart starts below the lane: it has to cross.
  const level = testLevel({
    spawn: { x: 4, y: 12.3, heading: 0 },
    hazards: [traffic({ speed: 3.5, gap: 4 })],
    cars: [
      { row: 0, stall: 3, model: "sedan", colour: "red" },
      { row: 0, stall: 6, model: "suv", colour: "black" },
    ],
  });

  it("can't plan across a lane without a gate, and can with one", () => {
    expect(planPath(createWorld(level, "standard"), 0.45)).toBeNull();
    const path = planPath(createWorld(level, "standard"), 0.45, 9)!;
    expect(path).not.toBeNull();
    // It crosses the lane at the gate, not somewhere else.
    const inLane = path.filter(([, y]) => Math.abs(y - 9) < 0.9);
    for (const [x] of inLane) expect(Math.abs(x - 9)).toBeLessThan(0.6);
  });

  it("finds a moment to cross and parks with R$ 0", () => {
    const run = findPar(level)!;
    expect(run).not.toBeNull();
    expect(run.world.status).toBe("parked");
    expect(run.world.damage).toBe(0);
    const again = simulate(level, "standard", run.inputs);
    expect(again.status).toBe("parked");
    expect(again.endTick).toBe(run.world.endTick);
  });

  it("stays out of the lane when it doesn't need to cross", () => {
    const below = testLevel({
      spawn: { x: 3, y: 12.3, heading: 0 },
      rows: [{ x: 1, y: 8.4, stalls: 8, opens: "up" }],
      size: [24, 14],
      corral: { row: 0, stall: 6 },
      hazards: [traffic({ y: 3 })],
    });
    const path = planPath(createWorld(below, "standard"), 0.45)!;
    expect(path).not.toBeNull();
    for (const [, y] of path) expect(y).toBeGreaterThan(4.5);
  });
});
