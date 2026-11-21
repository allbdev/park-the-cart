/**
 * The five carts. Each one is the same model (src/core/cart.ts) with different numbers, so the
 * same level plays differently. Body frame: +x forward, +y to the right; the handle is at -x.
 * Canvas board "The carts".
 */

export type CartId = "standard" | "rusty" | "basket" | "kiddie" | "wholesale";
export const CART_IDS: readonly CartId[] = ["standard", "rusty", "basket", "kiddie", "wholesale"];

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
  /** Finish this level number to unlock (0 = free). */
  unlockAfter: number;
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
    unlockAfter: 0,
  },
  rusty: {
    id: "rusty",
    length: 1.0,
    width: 0.58,
    mass: 26,
    push: 78,
    pullBack: 35,
    turn: 44,
    grip: 110,
    casterGrip: 0.4,
    drag: 15,
    rollResist: 8,
    hold: 80,
    spinDamping: 6,
    windFactor: 1,
    wheels: STANDARD_WHEELS,
    faults: [
      {
        wheel: 0,
        stuckAngle: 0,
        stuckGrip: 40,
        stuckDrag: 55,
        freeDrag: 4,
        stuckTime: [0.25, 0.7],
        freeTime: [0.5, 1.3],
      },
      {
        wheel: 3,
        stuckAngle: -0.1,
        stuckGrip: 8,
        stuckDrag: 45,
        freeDrag: 4,
        stuckTime: [0.2, 0.6],
        freeTime: [0.6, 1.5],
      },
    ],
    pulls: "jerks",
    unlockAfter: 3,
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
    unlockAfter: 5,
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
    unlockAfter: 7,
  },
  wholesale: {
    id: "wholesale",
    length: 1.4,
    width: 0.8,
    mass: 70,
    push: 140,
    pullBack: 60,
    turn: 110,
    grip: 110,
    casterGrip: 0.4,
    drag: 26,
    rollResist: 10,
    hold: 150,
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
        stuckDrag: 8,
        freeDrag: 4,
        stuckTime: [1.5, 3.5],
        freeTime: [0.6, 1.6],
      },
    ],
    pulls: "heavy",
    unlockAfter: 9,
  },
};
