import { cos, sin } from "./math";

/**
 * A rigid body in the lot. Units: metres, seconds, kilograms, radians. y points down (screen),
 * heading 0 points along +x. Mutable on purpose: the simulation step allocates nothing.
 */
export interface Body {
  x: number;
  y: number;
  /** Heading in radians. */
  a: number;
  vx: number;
  vy: number;
  /** Angular velocity, rad/s. */
  w: number;
  /** 0 for static and kinematic bodies. */
  invMass: number;
  invI: number;
  shape: "box" | "circle";
  /** Half length (along heading) and half width, for boxes. */
  hx: number;
  hy: number;
  /** Radius, for circles. */
  r: number;
  /** Cached cos/sin of `a`; refresh with `syncAxes` after changing `a`. */
  c: number;
  s: number;
}

export function makeBox(
  x: number,
  y: number,
  a: number,
  length: number,
  width: number,
  mass = 0,
): Body {
  const hx = length / 2;
  const hy = width / 2;
  const inertia = mass > 0 ? (mass * (length * length + width * width)) / 12 : 0;
  return {
    x,
    y,
    a,
    vx: 0,
    vy: 0,
    w: 0,
    invMass: mass > 0 ? 1 / mass : 0,
    invI: inertia > 0 ? 1 / inertia : 0,
    shape: "box",
    hx,
    hy,
    r: Math.sqrt(hx * hx + hy * hy),
    c: cos(a),
    s: sin(a),
  };
}

export function makeCircle(x: number, y: number, r: number, mass = 0): Body {
  const inertia = mass > 0 ? 0.5 * mass * r * r : 0;
  return {
    x,
    y,
    a: 0,
    vx: 0,
    vy: 0,
    w: 0,
    invMass: mass > 0 ? 1 / mass : 0,
    invI: inertia > 0 ? 1 / inertia : 0,
    shape: "circle",
    hx: r,
    hy: r,
    r,
    c: 1,
    s: 0,
  };
}

export function syncAxes(b: Body): void {
  b.c = cos(b.a);
  b.s = sin(b.a);
}

/** World point of a body-local point. */
export function toWorldX(b: Body, lx: number, ly: number): number {
  return b.x + lx * b.c - ly * b.s;
}
export function toWorldY(b: Body, lx: number, ly: number): number {
  return b.y + lx * b.s + ly * b.c;
}
/** Body-local coordinates of a world point. */
export function toLocalX(b: Body, wx: number, wy: number): number {
  const dx = wx - b.x;
  const dy = wy - b.y;
  return dx * b.c + dy * b.s;
}
export function toLocalY(b: Body, wx: number, wy: number): number {
  const dx = wx - b.x;
  const dy = wy - b.y;
  return -dx * b.s + dy * b.c;
}

export function speed(b: Body): number {
  return Math.sqrt(b.vx * b.vx + b.vy * b.vy);
}

/** Is a world point inside the box (or circle)? */
export function containsPoint(b: Body, wx: number, wy: number): boolean {
  if (b.shape === "circle") {
    const dx = wx - b.x;
    const dy = wy - b.y;
    return dx * dx + dy * dy <= b.r * b.r;
  }
  return Math.abs(toLocalX(b, wx, wy)) <= b.hx && Math.abs(toLocalY(b, wx, wy)) <= b.hy;
}

/** The four corners of a box, written into `out` as x0,y0,x1,y1,... */
export function corners(b: Body, out: number[]): number[] {
  const ux = b.c * b.hx;
  const uy = b.s * b.hx;
  const vx = -b.s * b.hy;
  const vy = b.c * b.hy;
  out[0] = b.x + ux + vx;
  out[1] = b.y + uy + vy;
  out[2] = b.x - ux + vx;
  out[3] = b.y - uy + vy;
  out[4] = b.x - ux - vx;
  out[5] = b.y - uy - vy;
  out[6] = b.x + ux - vx;
  out[7] = b.y + uy - vy;
  return out;
}
