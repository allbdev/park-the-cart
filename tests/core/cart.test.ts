import { describe, expect, it } from "vitest";
import { CARTS, CART_IDS, type CartId } from "../../src/content/carts";
import { speed } from "../../src/core/body";
import {
  createCart,
  DRY,
  stepCart,
  stepFaults,
  TICK_RATE,
  WET,
  type Input,
  type Surface,
} from "../../src/core/cart";
import { createRng } from "../../src/core/rng";

function run(id: CartId, input: Input, seconds: number, surface: Surface = DRY, seed = 1) {
  const rng = createRng(seed);
  const cart = createCart(CARTS[id], 0, 0, 0, rng);
  for (let i = 0; i < seconds * TICK_RATE; i++) {
    stepFaults(cart, rng);
    stepCart(cart, input, surface, 0, 0);
  }
  return cart;
}

const PUSH: Input = { push: 1, turn: 0, hold: false };

describe("the standard cart", () => {
  it("pulls to the right when pushed straight", () => {
    const cart = run("standard", PUSH, 4);
    expect(cart.body.a).toBeGreaterThan(0.2); // turned right (clockwise on screen)
    expect(cart.body.y).toBeGreaterThan(0.5);
  });

  it("can be steered against the pull", () => {
    const cart = run("standard", { push: 1, turn: -1, hold: false }, 2);
    expect(cart.body.a).toBeLessThan(-0.5);
  });

  it("reaches a jogging speed, not a sprint", () => {
    const s = speed(run("standard", PUSH, 5).body);
    expect(s).toBeGreaterThan(1.6);
    expect(s).toBeLessThan(3);
  });

  it("turns on the spot", () => {
    const cart = run("standard", { push: 0, turn: 1, hold: false }, 1);
    expect(cart.body.a).toBeGreaterThan(0.5);
    expect(Math.hypot(cart.body.x, cart.body.y)).toBeLessThan(0.6);
  });

  it("coasts to a stop with no input", () => {
    const rng = createRng(1);
    const cart = createCart(CARTS.standard, 0, 0, 0, rng);
    cart.body.vx = 2;
    for (let i = 0; i < 6 * TICK_RATE; i++)
      stepCart(cart, { push: 0, turn: 0, hold: false }, DRY, 0, 0);
    expect(speed(cart.body)).toBeLessThan(0.01);
  });

  it("stops much sooner when held, and later in the rain", () => {
    const stopDistance = (hold: boolean, surface: Surface) => {
      const cart = createCart(CARTS.standard, 0, 0, 0, createRng(1));
      cart.body.vx = 2;
      let n = 0;
      while (speed(cart.body) > 0.02 && n++ < 3000)
        stepCart(cart, { push: 0, turn: 0, hold }, surface, 0, 0);
      return Math.hypot(cart.body.x, cart.body.y);
    };
    expect(stopDistance(true, DRY)).toBeLessThan(stopDistance(false, DRY) / 3);
    expect(stopDistance(true, WET)).toBeGreaterThan(stopDistance(true, DRY) * 1.5);
    expect(stopDistance(false, WET)).toBeGreaterThan(stopDistance(false, DRY) * 1.3);
  });

  it("never gains energy with no input (all carts, both surfaces)", () => {
    for (const id of CART_IDS) {
      for (const surface of [DRY, WET]) {
        const rng = createRng(id);
        const cart = createCart(CARTS[id], 0, 0, 0, rng);
        cart.body.vx = 2.5;
        cart.body.vy = 1;
        cart.body.w = 2;
        const energy = () => {
          const b = cart.body;
          return (b.vx * b.vx + b.vy * b.vy) / b.invMass + (b.w * b.w) / b.invI;
        };
        let last = energy();
        for (let i = 0; i < 4 * TICK_RATE; i++) {
          stepFaults(cart, rng);
          stepCart(cart, { push: 0, turn: 0, hold: false }, surface, 0, 0);
          const e = energy();
          expect(e, id).toBeLessThanOrEqual(last * (1 + 1e-9) + 1e-12);
          last = e;
        }
      }
    }
  });
});

describe("faults", () => {
  it("switch between stuck and rolling on the seed, the same every time", () => {
    const phases = (seed: number) => {
      const rng = createRng(seed);
      const cart = createCart(CARTS.standard, 0, 0, 0, rng);
      const out: boolean[] = [];
      for (let i = 0; i < 20 * TICK_RATE; i++) {
        stepFaults(cart, rng);
        out.push(cart.faults[0]!.stuck);
      }
      return out;
    };
    const a = phases(3);
    expect(phases(3)).toEqual(a);
    expect(a.filter((s) => s).length).toBeGreaterThan(a.length * 0.5);
    expect(a.filter((s) => !s).length).toBeGreaterThan(a.length * 0.1);
    expect(phases(4)).not.toEqual(a);
  });
});

describe("the other carts", () => {
  it("basket is light, wholesale is slow to stop, kiddie barely turns", () => {
    expect(CARTS.basket.mass).toBeLessThan(CARTS.standard.mass);
    const coast = (id: CartId) => {
      const cart = createCart(CARTS[id], 0, 0, 0, createRng(1));
      cart.body.vx = 2;
      for (let i = 0; i < 3 * TICK_RATE; i++)
        stepCart(cart, { push: 0, turn: 0, hold: false }, DRY, 0, 0);
      return cart.body.x;
    };
    expect(coast("wholesale")).toBeGreaterThan(coast("standard") * 1.5);
    const spin = (id: CartId) => run(id, { push: 0, turn: 1, hold: false }, 1).body.a;
    expect(spin("kiddie")).toBeLessThan(spin("standard") / 2);
  });

  it("are all deterministic", () => {
    for (const id of CART_IDS) {
      const a = run(id, { push: 1, turn: 0.4, hold: false }, 3, DRY, 9).body;
      const b = run(id, { push: 1, turn: 0.4, hold: false }, 3, DRY, 9).body;
      expect([a.x, a.y, a.a]).toEqual([b.x, b.y, b.a]);
    }
  });
});
