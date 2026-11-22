import { CARTS, type CartId } from "../content/carts";
import { containsPoint, type Body } from "./body";
import { TICK_RATE, type Input } from "./cart";
import type { Level } from "./level";
import { atan2, clamp, cos, wrapAngle } from "./math";
import { createWorld, step, type World } from "./world";

/**
 * The parking bot: plans a path on a grid around everything that can bill (cars inflated by the
 * cart's size plus a margin, open doors, the lane a reversing car backs into, cones), then drives
 * the real simulation along it with a steering controller. Whatever it presses is a valid input
 * log, so a successful run is a par run (and proof the level can be finished with R$ 0).
 *
 * Traffic can't be planned around in space alone. Its lanes are blocked on the grid, with one
 * narrow gate left open to cross at; `findPar` then tries gates and waits at the start until one
 * combination crosses in a gap between cars.
 */

export interface BotOptions {
  /** Extra clearance around obstacles, metres. */
  margin: number;
  /** Cruise speed, m/s. */
  cruise: number;
  /** Give up after this many seconds. */
  timeout: number;
  /** Cross the traffic lanes at this x (see `planPath`). */
  gate?: number;
}

export interface BotRun {
  inputs: Input[];
  world: World;
  path: [number, number][];
}

const CELL = 0.25;

function dist(dx: number, dy: number): number {
  return Math.sqrt(dx * dx + dy * dy);
}

interface Grid {
  w: number;
  h: number;
  blocked: Uint8Array;
}

function inflateBox(b: Body, grow: number, extendBack = 0): Body {
  return {
    ...b,
    x: b.x - b.c * (extendBack / 2),
    y: b.y - b.s * (extendBack / 2),
    hx: b.hx + grow + extendBack / 2,
    hy: b.hy + grow,
    r: b.r + grow + extendBack,
  };
}

function buildGrid(world: World, clearance: number, gate?: number): Grid {
  const [W, H] = world.level.size;
  const w = Math.ceil(W / CELL);
  const h = Math.ceil(H / CELL);
  const blocked = new Uint8Array(w * h);
  const solids: Body[] = [];
  for (const s of world.statics) solids.push(inflateBox(s, clearance));
  for (const car of world.cars) {
    if (car.traffic) continue;
    const r = car.reverse;
    // A car that will back out: block its lane too.
    solids.push(inflateBox(car.body, clearance + (car.manager ? 0.3 : 0), r ? r.distance + 1 : 0));
    if (car.door) {
      // The open door sweeps just under a metre out of that side; keep away from it.
      const d = car.door.side;
      const b = car.body;
      solids.push({
        ...b,
        x: b.x - b.s * d * (b.hy + 0.48),
        y: b.y + b.c * d * (b.hy + 0.48),
        hx: b.hx * 0.6 + clearance,
        hy: 0.48 + clearance,
        r: b.hx + 1.6 + clearance,
      });
    }
  }
  for (const cone of world.cones) solids.push({ ...cone.body, r: cone.body.r + clearance + 0.1 });
  for (const l of world.loose) solids.push(inflateBox(l, clearance + 0.2));
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = (i + 0.5) * CELL;
      const y = (j + 0.5) * CELL;
      for (const s of solids) {
        if (containsPoint(s, x, y)) {
          blocked[j * w + i] = 1;
          break;
        }
      }
    }
  }
  // Traffic lanes: closed along their whole length, but for a gate one cart wide.
  for (const car of world.cars) {
    if (!car.traffic) continue;
    const half = car.body.hy + clearance + 0.25;
    for (let j = 0; j < h; j++) {
      const y = (j + 0.5) * CELL;
      if (Math.abs(y - car.body.y) > half) continue;
      for (let i = 0; i < w; i++) {
        const x = (i + 0.5) * CELL;
        if (gate !== undefined && Math.abs(x - gate) < CELL * 1.5) continue;
        blocked[j * w + i] = 1;
      }
    }
  }
  return { w, h, blocked };
}

function cellOf(g: Grid, x: number, y: number): number {
  const i = clamp(Math.floor(x / CELL), 0, g.w - 1);
  const j = clamp(Math.floor(y / CELL), 0, g.h - 1);
  return j * g.w + i;
}

/** A* over 8-connected cells. Returns centre points, or null. */
function astar(g: Grid, sx: number, sy: number, tx: number, ty: number): [number, number][] | null {
  const start = cellOf(g, sx, sy);
  const goal = cellOf(g, tx, ty);
  const n = g.w * g.h;
  const gScore = new Float64Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  // A small binary heap of [f, cell].
  const heap: number[] = [];
  const fOf = new Float64Array(n);
  const push = (c: number) => {
    heap.push(c);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (fOf[heap[p]!]! <= fOf[heap[k]!]!) break;
      [heap[p], heap[k]] = [heap[k]!, heap[p]!];
      k = p;
    }
  };
  const pop = (): number => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < heap.length && fOf[heap[l]!]! < fOf[heap[m]!]!) m = l;
        if (r < heap.length && fOf[heap[r]!]! < fOf[heap[m]!]!) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k]!, heap[m]!];
        k = m;
      }
    }
    return top;
  };
  const gx = goal % g.w;
  const gy = Math.floor(goal / g.w);
  const hOf = (c: number) => {
    const dx = Math.abs((c % g.w) - gx);
    const dy = Math.abs(Math.floor(c / g.w) - gy);
    return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
  };
  gScore[start] = 0;
  fOf[start] = hOf(start);
  push(start);
  while (heap.length) {
    const c = pop();
    if (c === goal) break;
    if (closed[c]) continue;
    closed[c] = 1;
    const ci = c % g.w;
    const cj = Math.floor(c / g.w);
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di;
        const nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= g.w || nj >= g.h) continue;
        const nc = nj * g.w + ni;
        if (g.blocked[nc] && nc !== goal) continue;
        // No cutting corners between two blocked cells.
        if (di && dj && (g.blocked[cj * g.w + ni] || g.blocked[nj * g.w + ci])) continue;
        const cost = gScore[c]! + (di && dj ? 1.4142 : 1);
        if (cost < gScore[nc]!) {
          gScore[nc] = cost;
          came[nc] = c;
          fOf[nc] = cost + hOf(nc);
          push(nc);
        }
      }
    }
  }
  if (came[goal] === -1 && goal !== start) return null;
  const path: [number, number][] = [];
  for (let c = goal; c !== -1; c = came[c]!) {
    path.push([((c % g.w) + 0.5) * CELL, (Math.floor(c / g.w) + 0.5) * CELL]);
    if (c === start) break;
  }
  return path.reverse();
}

function lineFree(g: Grid, ax: number, ay: number, bx: number, by: number): boolean {
  const d = dist(bx - ax, by - ay);
  const n = Math.ceil(d / (CELL / 2));
  for (let k = 0; k <= n; k++) {
    const t = n ? k / n : 0;
    if (g.blocked[cellOf(g, ax + (bx - ax) * t, ay + (by - ay) * t)]) return false;
  }
  return true;
}

/** String-pulling: keep only the waypoints needed for straight, clear segments. */
function smooth(g: Grid, path: [number, number][]): [number, number][] {
  if (path.length < 3) return path;
  const out: [number, number][] = [path[0]!];
  let i = 0;
  while (i < path.length - 1) {
    let j = path.length - 1;
    while (j > i + 1 && !lineFree(g, path[i]![0], path[i]![1], path[j]![0], path[j]![1])) j--;
    out.push(path[j]!);
    i = j;
  }
  return out;
}

/** The corral's open side and a point just outside it, plus its centre. */
function corralTargets(world: World): { approach: [number, number]; centre: [number, number] } {
  const c = world.corral;
  const row = world.level.rows[world.level.corral.row]!;
  const cx = c.x + c.w / 2;
  const centre: [number, number] = [cx, c.y + c.h / 2];
  const approach: [number, number] = row.opens === "down" ? [cx, c.y + c.h + 1.6] : [cx, c.y - 1.6];
  return { approach, centre };
}

/** Plans a path from the cart to the corral, or null if there isn't one at this clearance. */
export function planPath(world: World, margin: number, gate?: number): [number, number][] | null {
  const spec = world.cart.spec;
  const clearance = spec.width / 2 + margin;
  const g = buildGrid(world, clearance, gate);
  const b = world.cart.body;
  // The spawn may sit inside the inflated margin; free the cells around it.
  const si = Math.floor(b.x / CELL);
  const sj = Math.floor(b.y / CELL);
  for (let dj = -3; dj <= 3; dj++)
    for (let di = -3; di <= 3; di++) {
      const i = si + di;
      const j = sj + dj;
      if (i >= 0 && j >= 0 && i < g.w && j < g.h) g.blocked[j * g.w + i] = 0;
    }
  const { approach, centre } = corralTargets(world);
  const path = astar(g, b.x, b.y, approach[0], approach[1]);
  if (!path) return null;
  const s = smooth(g, path);
  s.push(centre);
  return s;
}

/**
 * Drives the simulation along the plan. `prefix` is played first (as a person would), and the
 * bot takes over from wherever that leaves the cart; the returned inputs include the prefix.
 */
export function drive(
  level: Level,
  cartId: CartId,
  opts: BotOptions,
  prefix: readonly Input[] = [],
): BotRun | null {
  const world = createWorld(level, cartId);
  const inputs: Input[] = [];
  for (const i of prefix) {
    if (world.status !== "playing") break;
    inputs.push(i);
    step(world, i);
  }
  const path = planPath(world, opts.margin, opts.gate);
  if (!path) return null;
  const spec = CARTS[cartId];
  let seg = 1;
  const maxTicks = opts.timeout * TICK_RATE;
  const centre = path[path.length - 1]!;
  while (world.status === "playing" && world.tick < maxTicks) {
    const b = world.cart.body;
    // Advance along the path when close to the current waypoint.
    while (seg < path.length - 1 && dist(path[seg]![0] - b.x, path[seg]![1] - b.y) < 1.1) seg++;
    const [tx, ty] = path[seg]!;
    const distGoal = dist(centre[0] - b.x, centre[1] - b.y);
    const finalLeg = seg === path.length - 1;
    const desired = atan2(ty - b.y, tx - b.x);
    const err = wrapAngle(desired - b.a);
    const vf = b.vx * b.c + b.vy * b.s;
    let input: Input;
    if (finalLeg && distGoal < 0.9) {
      input = { push: 0, turn: clamp(-0.5 * b.w, -1, 1), hold: true };
    } else {
      const turn = clamp(2.8 * err - 0.9 * b.w, -1, 1);
      let target = Math.min(opts.cruise, Math.sqrt(2 * 0.9 * Math.max(0, distGoal - 0.6)) + 0.25);
      if (finalLeg) target = Math.min(target, 0.9);
      target *= Math.max(0, cos(err));
      if (Math.abs(err) > 1.0) target = 0;
      let push = clamp(1.6 * (target - vf) + (spec.rollResist / spec.push) * 2, -1, 1);
      let hold = false;
      if (vf > target + 0.35) {
        push = 0;
        hold = true;
      }
      if (target === 0 && push > 0) push = 0;
      input = { push, turn, hold };
    }
    inputs.push(input);
    step(world, input);
  }
  return { inputs, world, path };
}

const WAIT: Input = { push: 0, turn: 0, hold: true };

/** Tries a few clearances and speeds; returns the fastest run that parks with R$ 0. */
export function findPar(level: Level, cartId: CartId = "standard"): BotRun | null {
  if (level.hazards.some((h) => h.type === "traffic")) return findParInTraffic(level, cartId);
  let best: BotRun | null = null;
  for (const margin of [0.6, 0.45, 0.8, 0.35, 1.0]) {
    for (const cruise of [1.8, 1.4, 1.0, 0.7]) {
      const run = drive(level, cartId, { margin, cruise, timeout: 90 });
      if (!run || run.world.status !== "parked" || run.world.damage !== 0) continue;
      if (!best || run.world.endTick < best.world.endTick) best = run;
    }
    if (best) return best;
  }
  return best;
}

/**
 * With traffic, timing matters: try each crossing gate (and no gate, when start and corral are
 * on the same side of the lanes), each clearance and speed, and a wait at the start of up to a
 * full traffic cycle. Returns the first clean run of the fastest few found.
 */
function findParInTraffic(level: Level, cartId: CartId): BotRun | null {
  const W = level.size[0];
  // Straight across in front of the corral first, then at the start, then everywhere else.
  const start = createWorld(level, cartId);
  const gates: (number | undefined)[] = [
    undefined,
    start.corral.x + start.corral.w / 2,
    start.cart.body.x,
  ];
  for (let x = 1.5; x < W - 1; x += 1.5) gates.push(x);
  let cycle = 0;
  for (const h of level.hazards) {
    if (h.type === "traffic") cycle = Math.max(cycle, (W + 8) / h.speed + h.gap);
  }
  let best: BotRun | null = null;
  let found = 0;
  for (const margin of [0.6, 0.45, 0.8, 0.35]) {
    for (const cruise of [1.8, 1.4, 1.0]) {
      for (const gate of gates) {
        // A plan that doesn't exist won't exist after waiting either.
        if (!planPath(createWorld(level, cartId), margin, gate)) continue;
        for (let wait = 0; wait <= cycle; wait += 0.75) {
          const prefix: Input[] = new Array(Math.round(wait * TICK_RATE)).fill(WAIT);
          const run = drive(level, cartId, { margin, cruise, timeout: 90, gate }, prefix);
          if (!run || run.world.status !== "parked" || run.world.damage !== 0) continue;
          if (!best || run.world.endTick < best.world.endTick) best = run;
          if (++found >= 6) return best;
          break;
        }
      }
    }
    if (best) return best;
  }
  return best;
}
