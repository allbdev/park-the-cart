import type { CartSpec } from "../content/carts";
import { makeBox, syncAxes, type Body } from "./body";
import { cos, sin } from "./math";
import type { Rng } from "./rng";

export const TICK_RATE = 120;
export const DT = 1 / TICK_RATE;
const GRAVITY = 9.81;

/** What the player asks for in one tick. push and turn are -1..1; hold is on or off. */
export interface Input {
  push: number;
  turn: number;
  hold: boolean;
}

export const NO_INPUT: Input = { push: 0, turn: 0, hold: false };

export interface Surface {
  /** Sideways friction coefficient. */
  mu: number;
  /** Multiplies rolling drag and resistance. */
  dragScale: number;
  /** Multiplies the hold brake. */
  holdScale: number;
}

export const DRY: Surface = { mu: 0.9, dragScale: 1, holdScale: 1 };
export const WET: Surface = { mu: 0.32, dragScale: 0.75, holdScale: 0.35 };

export interface FaultState {
  stuck: boolean;
  /** Ticks left in this phase. */
  left: number;
  /** This phase's angle multiplier (0.6..1), from the seed. */
  jitter: number;
}

export interface Cart {
  spec: CartSpec;
  body: Body;
  faults: FaultState[];
}

export function createCart(spec: CartSpec, x: number, y: number, a: number, rng: Rng): Cart {
  const body = makeBox(x, y, a, spec.length, spec.width, spec.mass);
  // A shopping cart's inertia is dominated by its frame and contents, roughly a uniform box.
  const faults = spec.faults.map((f) => ({
    stuck: true,
    left: Math.round(rng.range(f.stuckTime[0], f.stuckTime[1]) * TICK_RATE),
    jitter: rng.range(0.6, 1),
  }));
  return { spec, body, faults };
}

/** Advance the stuck/rolling phases of every faulty wheel by one tick. */
export function stepFaults(cart: Cart, rng: Rng): void {
  for (let i = 0; i < cart.faults.length; i++) {
    const st = cart.faults[i]!;
    const f = cart.spec.faults[i]!;
    if (--st.left > 0) continue;
    st.stuck = !st.stuck;
    const [lo, hi] = st.stuck ? f.stuckTime : f.freeTime;
    st.left = Math.max(1, Math.round(rng.range(lo, hi) * TICK_RATE));
    st.jitter = rng.range(0.6, 1);
  }
}

/** Apply an impulse (jx, jy) at world offset (rx, ry) from the centre. */
function applyImpulse(b: Body, jx: number, jy: number, rx: number, ry: number): void {
  b.vx += jx * b.invMass;
  b.vy += jy * b.invMass;
  b.w += (rx * jy - ry * jx) * b.invI;
}

/**
 * Wheel forces for one tick: sideways grip as an impulse that cancels (part of) the sideways
 * slip at each wheel, capped by friction, plus rolling drag that never reverses the wheel.
 * Doing it with impulses keeps it stable at any grip.
 */
function wheelImpulses(
  b: Body,
  spec: CartSpec,
  faults: readonly FaultState[] | null,
  surface: Surface,
  holding: boolean,
): void {
  const nWheels = spec.wheels.length;
  const normal = (spec.mass * GRAVITY) / nWheels;
  const maxLateral = surface.mu * normal * DT;
  for (let i = 0; i < nWheels; i++) {
    const wheel = spec.wheels[i]!;
    let grip = wheel.kind === "fixed" ? spec.grip : spec.casterGrip;
    let angle = b.a;
    let extraDrag = 0;
    if (faults) {
      for (let k = 0; k < spec.faults.length; k++) {
        const f = spec.faults[k]!;
        if (f.wheel !== i) continue;
        const st = faults[k]!;
        if (st.stuck) {
          angle = b.a + f.stuckAngle * st.jitter;
          grip = Math.max(grip, f.stuckGrip);
          extraDrag += f.stuckDrag;
        } else {
          extraDrag += f.freeDrag;
        }
      }
    }
    const rx = wheel.x * b.c - wheel.y * b.s;
    const ry = wheel.x * b.s + wheel.y * b.c;
    const dc = angle === b.a ? b.c : cos(angle);
    const ds = angle === b.a ? b.s : sin(angle);
    const nx = -ds;
    const ny = dc;
    // Sideways.
    let vwx = b.vx - b.w * ry;
    let vwy = b.vy + b.w * rx;
    const vl = vwx * nx + vwy * ny;
    const rn = rx * ny - ry * nx;
    const kl = b.invMass + rn * rn * b.invI;
    let jl = (-vl / kl) * Math.min(1, grip * DT);
    if (jl > maxLateral) jl = maxLateral;
    if (jl < -maxLateral) jl = -maxLateral;
    applyImpulse(b, jl * nx, jl * ny, rx, ry);
    // Rolling.
    vwx = b.vx - b.w * ry;
    vwy = b.vy + b.w * rx;
    const vr = vwx * dc + vwy * ds;
    const rd = rx * ds - ry * dc;
    const kr = b.invMass + rd * rd * b.invI;
    const dragCoef =
      ((spec.drag + extraDrag) * surface.dragScale) / nWheels +
      (holding ? (spec.hold * surface.holdScale) / nWheels : 0);
    let jr =
      -(dragCoef * vr + (spec.rollResist * surface.dragScale * Math.sign(vr)) / nWheels) * DT;
    const maxJr = Math.abs(vr) / kr;
    if (jr > maxJr) jr = maxJr;
    if (jr < -maxJr) jr = -maxJr;
    applyImpulse(b, jr * dc, jr * ds, rx, ry);
  }
}

/**
 * One tick of the player's cart: handle forces, external acceleration (slope, wind), wheels,
 * then integrate. Collisions are resolved afterwards by the world.
 */
export function stepCart(cart: Cart, input: Input, surface: Surface, ax: number, ay: number): void {
  const b = cart.body;
  const spec = cart.spec;
  const push = input.push >= 0 ? input.push * spec.push : input.push * spec.pullBack;
  b.vx += (push * b.c * b.invMass + ax) * DT;
  b.vy += (push * b.s * b.invMass + ay) * DT;
  // Twisting the handle swings the front sideways around the fixed rear wheels: a sideways
  // force at the front axle, which is how a real cart turns on the spot.
  if (input.turn !== 0) {
    const f = input.turn * spec.turn * DT;
    const fx = spec.length * 0.36;
    applyImpulse(b, -b.s * f, b.c * f, b.c * fx, b.s * fx);
  }
  b.w -= spec.spinDamping * b.w * b.invI * DT;
  wheelImpulses(b, spec, cart.faults, surface, input.hold);
  integrate(b);
}

/** A cart nobody pushes (the abandoned one): free casters, some drag. */
export function stepLooseCart(b: Body, spec: CartSpec, surface: Surface, ax: number, ay: number) {
  b.vx += ax * DT;
  b.vy += ay * DT;
  b.w -= spec.spinDamping * b.w * b.invI * DT;
  wheelImpulses(b, spec, null, surface, false);
  integrate(b);
}

export function integrate(b: Body): void {
  b.x += b.vx * DT;
  b.y += b.vy * DT;
  if (b.w !== 0) {
    b.a += b.w * DT;
    syncAxes(b);
  }
}
