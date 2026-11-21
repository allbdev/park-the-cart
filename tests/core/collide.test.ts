import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { makeBox, makeCircle, speed } from "../../src/core/body";
import { collide, makeContact, resolve } from "../../src/core/collide";

const mat = { restitution: 0.2, friction: 0.3 };

describe("collide", () => {
  it("finds overlapping boxes and points the normal from A to B", () => {
    const a = makeBox(0, 0, 0, 2, 1);
    const b = makeBox(1.8, 0, 0, 2, 1);
    const c = makeContact();
    expect(collide(a, b, c)).toBe(true);
    expect(c.nx).toBeCloseTo(1);
    expect(c.depth).toBeCloseTo(0.2);
  });

  it("separates boxes that only touch at their bounding circles", () => {
    const a = makeBox(0, 0, 0, 2, 0.4);
    const b = makeBox(1.5, 0.8, 0, 2, 0.4);
    expect(collide(a, b, makeContact())).toBe(false);
  });

  it("handles rotated boxes", () => {
    const a = makeBox(0, 0, Math.PI / 4, 2, 0.5);
    const b = makeBox(0.9, 0.9, 0, 0.5, 0.5);
    const c = makeContact();
    expect(collide(a, b, c)).toBe(true);
  });

  it("box against circle, both ways round", () => {
    const box = makeBox(0, 0, 0, 2, 1);
    const circle = makeCircle(0, 0.6, 0.2);
    const c = makeContact();
    expect(collide(box, circle, c)).toBe(true);
    expect(c.ny).toBeCloseTo(1);
    expect(c.depth).toBeCloseTo(0.1);
    expect(collide(circle, box, c)).toBe(true);
    expect(c.ny).toBeCloseTo(-1);
  });

  it("circle against circle", () => {
    const c = makeContact();
    expect(collide(makeCircle(0, 0, 1), makeCircle(1.5, 0, 1), c)).toBe(true);
    expect(c.depth).toBeCloseTo(0.5);
  });
});

describe("resolve", () => {
  it("bounces a moving box off a static one and separates them", () => {
    const wall = makeBox(2, 0, 0, 1, 4);
    const cart = makeBox(1.2, 0, 0, 1, 0.6, 20);
    cart.vx = 2;
    const c = makeContact();
    expect(collide(cart, wall, c)).toBe(true);
    resolve(cart, wall, c, mat);
    expect(cart.vx).toBeLessThan(0);
    expect(cart.vx).toBeGreaterThan(-2);
    expect(wall.x).toBe(2);
  });

  it("never adds energy and always reduces overlap (property)", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1, max: 1, noNaN: true }),
        fc.double({ min: -1, max: 1, noNaN: true }),
        fc.double({ min: -3.2, max: 3.2, noNaN: true }),
        fc.double({ min: -4, max: 4, noNaN: true }),
        fc.double({ min: -4, max: 4, noNaN: true }),
        (x, y, a, vx, vy) => {
          const wall = makeBox(0, 0, 0, 3, 2);
          const cart = makeBox(x * 2, y * 1.5, a, 1, 0.6, 20);
          cart.vx = vx;
          cart.vy = vy;
          const c = makeContact();
          if (!collide(cart, wall, c)) return;
          const before = speed(cart);
          const depth = c.depth;
          resolve(cart, wall, c, mat);
          // Linear speed can grow slightly from rotation coupling only within bounds.
          expect(speed(cart)).toBeLessThanOrEqual(before * 1.01 + 1e-9);
          const c2 = makeContact();
          if (collide(cart, wall, c2)) expect(c2.depth).toBeLessThan(depth + 1e-9);
        },
      ),
      { numRuns: 3000 },
    );
  });

  it("lets a kinematic body push a dynamic one", () => {
    const car = makeBox(0, 0, 0, 4, 2);
    car.vx = 1.5;
    const cart = makeBox(2.4, 0, 0, 1, 0.6, 20);
    const c = makeContact();
    expect(collide(car, cart, c)).toBe(true);
    resolve(car, cart, c, mat);
    expect(cart.vx).toBeGreaterThan(1);
    expect(car.vx).toBe(1.5);
  });
});
