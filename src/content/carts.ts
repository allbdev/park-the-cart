/**
 * The five carts. Each one is the same model (src/core/cart.ts) with different numbers, so the
 * same level plays differently. Body frame: +x forward, +y to the right; the handle is at -x.
 * Canvas board "The carts".
 */

export type CartId = "standard" | "rusty" | "basket" | "kiddie" | "wholesale";
export const CART_IDS: readonly CartId[] = ["standard", "rusty", "basket", "kiddie", "wholesale"];

/**
 * Carts unlock in this order: finish every level with one cart to get the next. Returns the cart
 * that has to do that before `id` opens, or null for the first cart, which is free.
 */
export function cartBefore(id: CartId): CartId | null {
  const i = CART_IDS.indexOf(id);
  return i > 0 ? CART_IDS[i - 1]! : null;
}

export interface WheelSpec {
  x: number;
  y: number;
  /** Fixed wheels grip sideways; casters swivel and barely do. */
  kind: "fixed" | "caster";
}

/** A wheel that misbehaves in phases: stuck for a while, then rolling, then stuck again. */
export interface FaultSpec {
  wheel: number;
  /** While stuck, the wheel points this far off the heading (radians, + = to the right). */
  stuckAngle: number;
  /** Sideways grip while stuck, per second (see CartSpec.grip). */
  stuckGrip: number;
  /** Extra rolling drag while stuck and while rolling, N per m/s. */
  stuckDrag: number;
  freeDrag: number;
  /** Phase lengths in seconds, drawn from the level's seed. */
  stuckTime: readonly [number, number];
  freeTime: readonly [number, number];
}

export interface CartSpec {
  id: CartId;
  /** Basket length and width in metres. */
  length: number;
  width: number;
  /** Kilograms, groceries included. */
  mass: number;
  /** Forward push and backward pull at full input, newtons. */
  push: number;
  pullBack: number;
  /** Twisting the handle, N·m at full input. */
  turn: number;
  /**
   * Sideways grip of fixed wheels and of free casters, per second: how fast the wheel cancels
   * sideways slip (120 or more = all of it every tick), always capped by friction.
   */
  grip: number;
  casterGrip: number;
  /** Rolling drag: linear (N per m/s) and constant (N). */
  drag: number;
  rollResist: number;
  /** Holding the cart back: drag in N per m/s. */
  hold: number;
  /** Damping on spin, N·m per rad/s. */
  spinDamping: number;
  /** How much wind catches it (1 = standard). */
  windFactor: number;
  wheels: readonly WheelSpec[];
  faults: readonly FaultSpec[];
  /** Which way the HUD says it pulls. */
  pulls: "left" | "right" | "jerks" | "straight" | "heavy";
}

const STANDARD_WHEELS: readonly WheelSpec[] = [
  { x: -0.36, y: -0.22, kind: "fixed" },
  { x: -0.36, y: 0.22, kind: "fixed" },
  { x: 0.36, y: -0.22, kind: "caster" },
  { x: 0.36, y: 0.22, kind: "caster" },
];

export const CARTS: Record<CartId, CartSpec> = {
  standard: {
    id: "standard",
    length: 1.0,
    width: 0.58,
    mass: 24,
    push: 50,
    pullBack: 30,
    turn: 44,
    grip: 110,
    casterGrip: 0.4,
    drag: 16,
    rollResist: 6,
    hold: 80,
    spinDamping: 6,
    windFactor: 1,
    wheels: STANDARD_WHEELS,
    faults: [
      {
        wheel: 3,
        stuckAngle: 0.35,
        stuckGrip: 3,
        stuckDrag: 10,
        freeDrag: 4,
        stuckTime: [1.4, 3.6],
        freeTime: [0.5, 1.4],
      },
    ],
    pulls: "right",
  },
  // Two seized wheels that let go and grab again: it lurches to faster than the standard cart,
  // then one wheel locks and it nearly stops, yawing towards whichever wheel grabbed. Hard to
  // turn on purpose, easy to turn by accident.
  rusty: {
    id: "rusty",
    length: 1.0,
    width: 0.58,
    mass: 26,
    push: 110,
    pullBack: 35,
    turn: 32,
    grip: 110,
    casterGrip: 0.4,
    drag: 12,
    rollResist: 8,
    hold: 80,
    spinDamping: 8,
    windFactor: 1,
    wheels: STANDARD_WHEELS,
    faults: [
      {
        wheel: 0,
        stuckAngle: 0,
        stuckGrip: 110,
        stuckDrag: 600,
        freeDrag: 4,
        stuckTime: [0.35, 0.9],
        freeTime: [0.5, 1.1],
      },
      {
        wheel: 3,
        stuckAngle: -0.45,
        stuckGrip: 50,
        stuckDrag: 420,
        freeDrag: 4,
        stuckTime: [0.3, 0.9],
        freeTime: [0.5, 1.2],
      },
    ],
    pulls: "jerks",
  },
  basket: {
    id: "basket",
    length: 0.8,
    width: 0.5,
    mass: 11,
    push: 30,
    pullBack: 22,
    turn: 24,
    grip: 90,
    casterGrip: 0.3,
    drag: 6,
    rollResist: 3,
    hold: 40,
    spinDamping: 2,
    windFactor: 2.6,
    wheels: [
      { x: -0.28, y: -0.19, kind: "fixed" },
      { x: -0.28, y: 0.19, kind: "fixed" },
      { x: 0.28, y: -0.19, kind: "caster" },
      { x: 0.28, y: 0.19, kind: "caster" },
    ],
    faults: [
      {
        wheel: 2,
        stuckAngle: -0.16,
        stuckGrip: 3,
        stuckDrag: 2,
        freeDrag: 1,
        stuckTime: [0.8, 2.2],
        freeTime: [0.4, 1.2],
      },
    ],
    pulls: "left",
  },
  kiddie: {
    id: "kiddie",
    length: 1.6,
    width: 0.62,
    mass: 34,
    push: 90,
    pullBack: 40,
    turn: 60,
    grip: 120,
    casterGrip: 6,
    drag: 18,
    rollResist: 8,
    hold: 100,
    spinDamping: 14,
    windFactor: 1.3,
    wheels: [
      { x: -0.66, y: -0.24, kind: "fixed" },
      { x: -0.66, y: 0.24, kind: "fixed" },
      // The toy car on the front: its wheels drag sideways, so the long cart barely turns.
      { x: 0.66, y: -0.24, kind: "caster" },
      { x: 0.66, y: 0.24, kind: "caster" },
    ],
    faults: [
      {
        wheel: 3,
        stuckAngle: 0.12,
        stuckGrip: 4,
        stuckDrag: 5,
        freeDrag: 3,
        stuckTime: [1.5, 4],
        freeTime: [0.5, 1.5],
      },
    ],
    pulls: "straight",
  },
  // A loaded platform trolley: all mass and almost no drag. It takes seconds to get moving,
  // ends up twice as fast as the standard cart, and holding it back barely helps.
  wholesale: {
    id: "wholesale",
    length: 1.4,
    width: 0.8,
    mass: 120,
    push: 48,
    pullBack: 40,
    turn: 110,
    grip: 110,
    casterGrip: 0.4,
    drag: 5,
    rollResist: 12,
    hold: 35,
    spinDamping: 22,
    windFactor: 0.6,
    wheels: [
      { x: -0.56, y: -0.32, kind: "fixed" },
      { x: -0.56, y: 0.32, kind: "fixed" },
      { x: 0.56, y: -0.32, kind: "caster" },
      { x: 0.56, y: 0.32, kind: "caster" },
    ],
    faults: [
      {
        wheel: 3,
        stuckAngle: 0.14,
        stuckGrip: 3,
        stuckDrag: 3,
        freeDrag: 1,
        stuckTime: [1.5, 3.5],
        freeTime: [0.6, 1.6],
      },
    ],
    pulls: "heavy",
  },
};
