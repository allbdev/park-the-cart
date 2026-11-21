import { corners, type Body } from "./body";

/** One contact: normal from A to B, penetration depth, and a contact point. */
export interface Contact {
  nx: number;
  ny: number;
  depth: number;
  px: number;
  py: number;
}

export function makeContact(): Contact {
  return { nx: 0, ny: 0, depth: 0, px: 0, py: 0 };
}

const ca: number[] = new Array(8).fill(0);
const cb: number[] = new Array(8).fill(0);

function project(pts: number[], ax: number, ay: number, out: { min: number; max: number }) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < 8; i += 2) {
    const d = pts[i]! * ax + pts[i + 1]! * ay;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  out.min = min;
  out.max = max;
}

const pa = { min: 0, max: 0 };
const pb = { min: 0, max: 0 };

/** Separating axes for two oriented boxes. */
function boxBox(a: Body, b: Body, out: Contact): boolean {
  corners(a, ca);
  corners(b, cb);
  let best = Infinity;
  let bnx = 0;
  let bny = 0;
  const axes = [a.c, a.s, -a.s, a.c, b.c, b.s, -b.s, b.c];
  for (let i = 0; i < 8; i += 2) {
    const ax = axes[i]!;
    const ay = axes[i + 1]!;
    project(ca, ax, ay, pa);
    project(cb, ax, ay, pb);
    const overlap = Math.min(pa.max, pb.max) - Math.max(pa.min, pb.min);
    if (overlap <= 0) return false;
    if (overlap < best) {
      best = overlap;
      // Point the normal from A towards B.
      const d = (b.x - a.x) * ax + (b.y - a.y) * ay;
      bnx = d >= 0 ? ax : -ax;
      bny = d >= 0 ? ay : -ay;
    }
  }
  out.nx = bnx;
  out.ny = bny;
  out.depth = best;
  // Contact point: the average of every corner of one box inside the other. Edge against edge
  // gives two corners and a point in the middle, so a flat hit doesn't spin the cart.
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let i = 0; i < 8; i += 2) {
    if (insideBox(a, cb[i]!, cb[i + 1]!, 0.01)) {
      sx += cb[i]!;
      sy += cb[i + 1]!;
      n++;
    }
    if (insideBox(b, ca[i]!, ca[i + 1]!, 0.01)) {
      sx += ca[i]!;
      sy += ca[i + 1]!;
      n++;
    }
  }
  if (n > 0) {
    out.px = sx / n;
    out.py = sy / n;
  } else {
    out.px = (a.x + b.x) / 2;
    out.py = (a.y + b.y) / 2;
  }
  return true;
}

function insideBox(b: Body, wx: number, wy: number, slack: number): boolean {
  const dx = wx - b.x;
  const dy = wy - b.y;
  const lx = dx * b.c + dy * b.s;
  const ly = -dx * b.s + dy * b.c;
  return Math.abs(lx) <= b.hx + slack && Math.abs(ly) <= b.hy + slack;
}

/** Box A against circle B. */
function boxCircle(a: Body, b: Body, out: Contact, flip: boolean): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lx = dx * a.c + dy * a.s;
  const ly = -dx * a.s + dy * a.c;
  const cx = lx < -a.hx ? -a.hx : lx > a.hx ? a.hx : lx;
  const cy = ly < -a.hy ? -a.hy : ly > a.hy ? a.hy : ly;
  let nlx: number;
  let nly: number;
  let depth: number;
  if (cx === lx && cy === ly) {
    // Centre inside the box: push out through the nearest face.
    const fx = a.hx - Math.abs(lx);
    const fy = a.hy - Math.abs(ly);
    if (fx < fy) {
      nlx = lx >= 0 ? 1 : -1;
      nly = 0;
      depth = fx + b.r;
    } else {
      nlx = 0;
      nly = ly >= 0 ? 1 : -1;
      depth = fy + b.r;
    }
  } else {
    const ex = lx - cx;
    const ey = ly - cy;
    const d2 = ex * ex + ey * ey;
    if (d2 >= b.r * b.r) return false;
    const d = Math.sqrt(d2);
    nlx = ex / d;
    nly = ey / d;
    depth = b.r - d;
  }
  const nx = nlx * a.c - nly * a.s;
  const ny = nlx * a.s + nly * a.c;
  out.nx = flip ? -nx : nx;
  out.ny = flip ? -ny : ny;
  out.depth = depth;
  out.px = a.x + cx * a.c - cy * a.s;
  out.py = a.y + cx * a.s + cy * a.c;
  return true;
}

function circleCircle(a: Body, b: Body, out: Contact): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const rr = a.r + b.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return false;
  const d = Math.sqrt(d2);
  out.nx = d > 1e-9 ? dx / d : 1;
  out.ny = d > 1e-9 ? dy / d : 0;
  out.depth = rr - d;
  out.px = a.x + out.nx * a.r;
  out.py = a.y + out.ny * a.r;
  return true;
}

/** Fills `out` and returns true when A and B overlap. Normal points from A to B. */
export function collide(a: Body, b: Body, out: Contact): boolean {
  // Cheap bounding-circle reject first.
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const rr = a.r + b.r;
  if (dx * dx + dy * dy > rr * rr) return false;
  if (a.shape === "box") {
    return b.shape === "box" ? boxBox(a, b, out) : boxCircle(a, b, out, false);
  }
  return b.shape === "box" ? boxCircle(b, a, out, true) : circleCircle(a, b, out);
}

/** Normal speed at the contact point (positive = closing). */
export function closingSpeed(a: Body, b: Body, c: Contact): number {
  const rax = c.px - a.x;
  const ray = c.py - a.y;
  const rbx = c.px - b.x;
  const rby = c.py - b.y;
  const vax = a.vx - a.w * ray;
  const vay = a.vy + a.w * rax;
  const vbx = b.vx - b.w * rby;
  const vby = b.vy + b.w * rbx;
  return (vax - vbx) * c.nx + (vay - vby) * c.ny;
}

export interface Material {
  restitution: number;
  friction: number;
}

/**
 * Impulse response plus positional correction. Kinematic bodies (invMass 0 but moving) push
 * through their velocity. Returns the normal impulse applied.
 */
export function resolve(a: Body, b: Body, c: Contact, m: Material): number {
  const invMassSum = a.invMass + b.invMass;
  if (invMassSum === 0) return 0;
  const rax = c.px - a.x;
  const ray = c.py - a.y;
  const rbx = c.px - b.x;
  const rby = c.py - b.y;

  // Positional correction (split by inverse mass), leaving a little slop.
  const slop = 0.002;
  const corr = Math.max(c.depth - slop, 0) * 0.8;
  if (corr > 0) {
    const ka = a.invMass / invMassSum;
    const kb = b.invMass / invMassSum;
    a.x -= c.nx * corr * ka;
    a.y -= c.ny * corr * ka;
    b.x += c.nx * corr * kb;
    b.y += c.ny * corr * kb;
  }

  const vn = closingSpeed(a, b, c);
  if (vn <= 0) return 0;
  const raCrossN = rax * c.ny - ray * c.nx;
  const rbCrossN = rbx * c.ny - rby * c.nx;
  const denom = invMassSum + raCrossN * raCrossN * a.invI + rbCrossN * rbCrossN * b.invI;
  const j = ((1 + m.restitution) * vn) / denom;
  a.vx -= j * c.nx * a.invMass;
  a.vy -= j * c.ny * a.invMass;
  a.w -= raCrossN * j * a.invI;
  b.vx += j * c.nx * b.invMass;
  b.vy += j * c.ny * b.invMass;
  b.w += rbCrossN * j * b.invI;

  // Friction along the tangent.
  const vax = a.vx - a.w * ray;
  const vay = a.vy + a.w * rax;
  const vbx = b.vx - b.w * rby;
  const vby = b.vy + b.w * rbx;
  const rvx = vax - vbx;
  const rvy = vay - vby;
  const tx = -c.ny;
  const ty = c.nx;
  const vt = rvx * tx + rvy * ty;
  const raCrossT = rax * ty - ray * tx;
  const rbCrossT = rbx * ty - rby * tx;
  const denomT = invMassSum + raCrossT * raCrossT * a.invI + rbCrossT * rbCrossT * b.invI;
  let jt = vt / denomT;
  const maxF = m.friction * j;
  if (jt > maxF) jt = maxF;
  if (jt < -maxF) jt = -maxF;
  a.vx -= jt * tx * a.invMass;
  a.vy -= jt * ty * a.invMass;
  a.w -= raCrossT * jt * a.invI;
  b.vx += jt * tx * b.invMass;
  b.vy += jt * ty * b.invMass;
  b.w += rbCrossT * jt * b.invI;
  return j;
}
