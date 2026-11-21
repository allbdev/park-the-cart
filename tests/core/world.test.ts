import { describe, expect, it } from "vitest";
import { TICK_RATE } from "../../src/core/cart";
import { createWorld, elapsed, quantise, simulate, step, type World } from "../../src/core/world";
import { idle, repeat, testLevel } from "./helpers";

const PUSH = { push: 1, turn: 0, hold: false };

/** Put the cart somewhere with a velocity, then let it coast. */
function launch(world: World, x: number, y: number, a: number, vx: number, vy: number) {
  const b = world.cart.body;
  b.x = x;
  b.y = y;
  b.a = a;
  b.c = Math.cos(a);
  b.s = Math.sin(a);
  b.vx = vx;
  b.vy = vy;
}

describe("simulate", () => {
  it("is a pure function of level, cart and inputs", () => {
    const inputs = [...repeat(PUSH, 200), ...repeat({ push: 0.5, turn: -1, hold: false }, 150)];
    const a = simulate(testLevel(), "standard", inputs);
    const b = simulate(testLevel(), "standard", inputs);
    expect([a.cart.body.x, a.cart.body.y, a.cart.body.a, a.tick]).toEqual([
      b.cart.body.x,
      b.cart.body.y,
      b.cart.body.a,
      b.tick,
    ]);
  });

  it("quantises inputs to sixteenths", () => {
    expect(quantise({ push: 0.51, turn: -2, hold: true })).toEqual({
      push: 0.5,
      turn: -1,
      hold: true,
    });
  });

  it("keeps the cart inside the lot", () => {
    const w = simulate(testLevel(), "standard", repeat({ push: 1, turn: 0.2, hold: false }, 3000));
    expect(w.cart.body.x).toBeGreaterThan(0);
    expect(w.cart.body.x).toBeLessThan(24);
    expect(w.cart.body.y).toBeGreaterThan(0);
    expect(w.cart.body.y).toBeLessThan(14);
  });
});

describe("damage", () => {
  const level = testLevel({
    cars: [{ row: 0, stall: 2, model: "sedan", colour: "silver" }],
  });

  it("bills a hit on a parked car once per zone per second", () => {
    const w = createWorld(level, "standard");
    const car = w.cars[0]!.body;
    // Drive into the car's side from the right.
    launch(w, car.x + car.hy + 0.9, car.y, Math.PI, -2, 0);
    for (let i = 0; i < 60; i++) step(w, idle(1)[0]!);
    expect(w.receipt.length).toBe(1);
    expect(w.receipt[0]).toMatchObject({ kind: "car", zone: "door", model: "sedan" });
    expect(w.damage).toBe(184_000);
  });

  it("doesn't bill a gentle touch", () => {
    const w = createWorld(level, "standard");
    const car = w.cars[0]!.body;
    launch(w, car.x + car.hy + 0.55, car.y, Math.PI, -0.15, 0);
    for (let i = 0; i < 120; i++) step(w, idle(1)[0]!);
    expect(w.receipt.length).toBe(0);
  });

  it("names the bumper when the cart hits the back of a nose-in car", () => {
    const w = createWorld(level, "standard");
    const car = w.cars[0]!.body;
    // The car points up; its rear faces the aisle below.
    launch(w, car.x, car.y + car.hx + 0.8, -Math.PI / 2, 0, -2);
    for (let i = 0; i < 60; i++) step(w, idle(1)[0]!);
    expect(w.receipt[0]).toMatchObject({ kind: "car", zone: "rearBumper" });
  });

  it("knocks a cone over, bills it once, and lets the cart go on", () => {
    const w = createWorld(testLevel({ hazards: [{ type: "cone", x: 8, y: 10 }] }), "standard");
    launch(w, 6, 10, 0, 2, 0);
    for (let i = 0; i < 200; i++) step(w, PUSH);
    expect(w.cones[0]!.down).toBe(true);
    expect(w.receipt.filter((l) => l.kind === "cone").length).toBe(1);
    expect(w.cart.body.x).toBeGreaterThan(8.5);
  });

  it("ends the run on touching the manager's car", () => {
    const w = createWorld(
      testLevel({ cars: [{ row: 0, stall: 2, model: "manager", colour: "black" }] }),
      "standard",
    );
    const car = w.cars[0]!.body;
    launch(w, car.x + car.hy + 0.7, car.y, Math.PI, -1.2, 0);
    for (let i = 0; i < 60; i++) step(w, idle(1)[0]!);
    expect(w.status).toBe("failed");
    expect(w.failedOn).toBe(0);
  });
});

describe("hazards", () => {
  it("opens a door when the cart passes beside it, and bills a hit on the door", () => {
    const w = createWorld(
      testLevel({ cars: [{ row: 0, stall: 2, model: "sedan", colour: "red", door: "right" }] }),
      "standard",
    );
    const car = w.cars[0]!;
    // The car points up, so its right side is +x. Walk the cart up the gap on that side.
    launch(w, car.body.x + 1.5, 6.5, -Math.PI / 2, 0, -1.6);
    let opened = false;
    for (let i = 0; i < 360; i++) {
      step(w, { push: 0.8, turn: -0.3, hold: false });
      if (car.door!.open > 0.5) opened = true;
    }
    expect(opened).toBe(true);
    expect(w.receipt.some((l) => l.kind === "door")).toBe(true);
  });

  it("backs a car out on a timer and bills the cart it hits", () => {
    const w = createWorld(
      testLevel({
        cars: [
          { row: 0, stall: 2, model: "suv", colour: "black", reverse: { at: 0.5, distance: 4 } },
        ],
      }),
      "standard",
    );
    const car = w.cars[0]!;
    const y0 = car.body.y;
    launch(w, car.body.x, 8.6, 0, 0, 0);
    for (let i = 0; i < 4 * TICK_RATE; i++) step(w, idle(1)[0]!);
    expect(car.body.y).toBeGreaterThan(y0 + 3.9);
    expect(car.reverse!.done).toBe(true);
    expect(w.receipt.filter((l) => l.kind === "reversing").length).toBe(1);
  });

  it("jolts the cart on a speed bump", () => {
    const go = (hazards: World["level"]["hazards"]) => {
      const w = createWorld(testLevel({ hazards }), "standard");
      launch(w, 6, 10, 0, 2, 0);
      for (let i = 0; i < 120; i++) step(w, PUSH);
      return w;
    };
    const flat = go([]);
    const bumpy = go([{ type: "speedBump", x: 7, y: 7, w: 0.8, h: 7 }]);
    expect(bumpy.cart.body.x).toBeLessThan(flat.cart.body.x);
    expect(bumpy.cart.body.a).not.toBe(flat.cart.body.a);
  });

  it("rolls the cart down a slope by itself", () => {
    const w = simulate(
      testLevel({
        hazards: [{ type: "slope", x: 0, y: 6, w: 24, h: 8, dir: 0, accel: 0.8 }],
      }),
      "standard",
      idle(3 * TICK_RATE),
    );
    expect(w.cart.body.x).toBeGreaterThan(5);
  });

  it("pushes the cart sideways in the wind", () => {
    const w = simulate(
      testLevel({ hazards: [{ type: "wind", dir: -Math.PI / 2, accel: 1.2 }] }),
      "standard",
      repeat(PUSH, 3 * TICK_RATE),
    );
    const calm = simulate(testLevel(), "standard", repeat(PUSH, 3 * TICK_RATE));
    expect(w.cart.body.y).toBeLessThan(calm.cart.body.y - 0.3);
  });

  it("slides further in the rain", () => {
    const run = (surface: "dry" | "wet") =>
      simulate(testLevel({ surface }), "standard", [...repeat(PUSH, 200), ...idle(600)]).cart.body
        .x;
    expect(run("wet")).toBeGreaterThan(run("dry") + 1);
  });
});

describe("parking", () => {
  it("parks when the cart sits still inside the corral", () => {
    const w = createWorld(testLevel(), "standard");
    const c = w.corral;
    launch(w, c.x + c.w / 2, c.y + c.h / 2, -Math.PI / 2, 0, 0);
    for (let i = 0; i < TICK_RATE; i++) step(w, idle(1)[0]!);
    expect(w.status).toBe("parked");
    expect(elapsed(w)).toBeCloseTo(0.5, 1);
    const tick = w.tick;
    step(w, PUSH);
    expect(w.tick).toBe(tick); // nothing moves after the end
  });

  it("doesn't park a cart that is moving or half outside", () => {
    const w = createWorld(testLevel(), "standard");
    const c = w.corral;
    launch(w, c.x + c.w / 2, c.y + c.h + 0.1, -Math.PI / 2, 0, 0);
    for (let i = 0; i < TICK_RATE; i++) step(w, idle(1)[0]!);
    expect(w.status).toBe("playing");
  });

  it("has rails on the corral's closed sides", () => {
    const w = createWorld(testLevel(), "standard");
    const c = w.corral;
    launch(w, c.x + c.w / 2, c.y + c.h - 0.8, -Math.PI / 2, 0, -2.5);
    for (let i = 0; i < 120; i++) step(w, idle(1)[0]!);
    expect(w.cart.body.y).toBeGreaterThan(c.y);
  });
});
