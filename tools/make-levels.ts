/**
 * Builds the ten levels from the specs below and writes them to src/content/levels/*.json, each
 * with a par run. A level is drawn from its spec and a seed; the parking bot must then park it
 * with R$ 0 in under 55 seconds, or the next seed is tried. So the levels can be as nasty as the
 * specs ask and are still finishable by construction.
 *
 *   npm run make-levels                # all levels
 *   npm run make-levels -- 08-black-friday
 *
 * To tune the difficulty, change a spec and re-run. Hand edits to the JSON files are overwritten.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CAR_COLOURS, type CarModel } from "../src/content/cars";
import { drive, findPar } from "../src/core/bot";
import { TICK_RATE } from "../src/core/cart";
import type { Hazard, Level, LevelCar, Paint } from "../src/core/level";
import { encodeInputs } from "../src/core/replay";
import { createRng, type Rng } from "../src/core/rng";
import { validateLevel } from "../src/core/validate";

const W = 32;
const H = 18;
const AISLE: [number, number] = [5.6, 12.4];
const HALF_PI = 1.570796;
const MODELS: readonly CarModel[] = ["sedan", "sedan", "suv", "suv", "hatch", "pickup"];

const stallX = (stall: number) => 0.4 + stall * 2.6 + 1.3;
/** Standing in a stall of the bottom row (1) or top row (0), facing the aisle. */
const inStall = (row: 0 | 1, stall: number) => ({
  x: stallX(stall),
  y: row === 1 ? 15.2 : 2.8,
  heading: row === 1 ? -HALF_PI : HALF_PI,
});

interface Lane {
  y: number;
  dir: 1 | -1;
  speed: number;
  gap: number;
  /** Cars in the lane, evenly spaced through the cycle. */
  cars: number;
}

interface Spec {
  id: string;
  seed: number;
  /** Card limit in reais. */
  limit: number;
  surface?: "wet";
  spawn: { x: number; y: number; heading: number };
  /** The stall the cart starts in, if it starts in one. */
  spawnStall?: [0 | 1, number];
  corral: { row: 0 | 1; stall: number };
  /** Share of stalls with a car in them. */
  fill: number;
  managers?: number;
  doors?: number;
  reversers?: number;
  cones?: number;
  carts?: number;
  bumps?: number[];
  wind?: { dir: number; accel: number };
  slope?: { dir: number; accel: number };
  lanes?: Lane[];
}

const SPECS: Spec[] = [
  {
    id: "01-seniors-space",
    seed: 1,
    limit: 4000,
    spawn: { x: 3, y: 9, heading: 0 },
    corral: { row: 0, stall: 7 },
    fill: 0.55,
    cones: 3,
  },
  {
    id: "02-sunday-morning",
    seed: 2,
    limit: 3000,
    spawn: inStall(1, 10),
    spawnStall: [1, 10],
    corral: { row: 0, stall: 1 },
    fill: 0.7,
    cones: 5,
    bumps: [14],
  },
  {
    id: "03-speed-bump",
    seed: 3,
    limit: 2500,
    spawn: inStall(1, 1),
    spawnStall: [1, 1],
    corral: { row: 0, stall: 9 },
    fill: 0.85,
    cones: 7,
    bumps: [10, 20],
  },
  {
    id: "04-abandoned-cart",
    seed: 4,
    limit: 2000,
    spawn: { x: 2.6, y: 8.8, heading: 0 },
    corral: { row: 1, stall: 10 },
    fill: 0.85,
    doors: 1,
    cones: 5,
    carts: 3,
    bumps: [12],
  },
  {
    id: "05-the-slope",
    seed: 5,
    limit: 1900,
    spawn: { x: 2.6, y: 9, heading: 0 },
    corral: { row: 0, stall: 10 },
    fill: 0.85,
    doors: 1,
    cones: 5,
    carts: 2,
    slope: { dir: HALF_PI, accel: 0.75 },
  },
  {
    id: "06-wind",
    seed: 6,
    limit: 1500,
    spawn: inStall(1, 0),
    spawnStall: [1, 0],
    corral: { row: 0, stall: 11 },
    fill: 0.9,
    cones: 4,
    carts: 2,
    wind: { dir: -HALF_PI, accel: 1.6 },
    lanes: [{ y: 7.4, dir: 1, speed: 2.6, gap: 7, cars: 1 }],
  },
  {
    id: "07-rain",
    seed: 7,
    limit: 1000,
    surface: "wet",
    spawn: { x: 2.6, y: 10.2, heading: 0 },
    corral: { row: 0, stall: 9 },
    fill: 0.9,
    doors: 1,
    cones: 5,
    carts: 1,
    bumps: [13],
    lanes: [{ y: 7.4, dir: -1, speed: 3, gap: 6, cars: 1 }],
  },
  {
    id: "08-black-friday",
    seed: 8,
    limit: 900,
    spawn: inStall(1, 2),
    spawnStall: [1, 2],
    corral: { row: 0, stall: 9 },
    fill: 1,
    doors: 5,
    cones: 8,
    carts: 2,
    bumps: [17.5],
    lanes: [{ y: 7.4, dir: 1, speed: 3.4, gap: 5, cars: 1 }],
  },
  {
    id: "09-managers-car",
    seed: 9,
    limit: 700,
    spawn: { x: 2.6, y: 10.2, heading: 0 },
    corral: { row: 0, stall: 6 },
    fill: 0.95,
    managers: 3,
    doors: 2,
    cones: 6,
    bumps: [10],
    wind: { dir: HALF_PI, accel: 0.7 },
    lanes: [{ y: 7.4, dir: -1, speed: 3.4, gap: 5, cars: 1 }],
  },
  {
    id: "10-rush-hour",
    seed: 10,
    limit: 100,
    surface: "wet",
    spawn: inStall(1, 0),
    spawnStall: [1, 0],
    corral: { row: 0, stall: 11 },
    fill: 1,
    managers: 1,
    doors: 2,
    reversers: 3,
    cones: 6,
    carts: 2,
    bumps: [16.5],
    wind: { dir: HALF_PI, accel: 0.8 },
    lanes: [{ y: 7.1, dir: 1, speed: 4, gap: 4, cars: 2 }],
  },
];

function build(spec: Spec, attempt: number): Level {
  const rng: Rng = createRng(`level:${spec.id}:${attempt}`);
  const lanes = spec.lanes ?? [];
  const cars: LevelCar[] = [];
  const empty: [number, number][] = [];
  const { row: cRow, stall: cStall } = spec.corral;

  for (let row = 0; row < 2; row++) {
    for (let stall = 0; stall < 12; stall++) {
      if (row === cRow && stall === cStall) continue;
      if (spec.spawnStall && spec.spawnStall[0] === row && spec.spawnStall[1] === stall) continue;
      const beside = row === cRow && Math.abs(stall - cStall) === 1;
      if (!beside && rng.next() > spec.fill) {
        empty.push([row, stall]);
        continue;
      }
      const car: LevelCar = { row, stall, model: rng.pick(MODELS), colour: rng.pick(CAR_COLOURS) };
      if (beside) {
        // The corral's neighbours are wide and parked badly, towards it.
        car.model = rng.pick(["suv", "pickup"] as const);
        car.shift = (cStall - stall) * rng.range(0.15, 0.3);
      } else {
        if (rng.next() < 0.35) car.shift = rng.range(-0.28, 0.28);
        if (rng.next() < 0.3) car.tilt = rng.range(-0.07, 0.07);
        if (rng.next() < 0.15) car.backIn = true;
      }
      cars.push(car);
    }
  }

  // The manager parks beside the corral first, then wherever.
  const beside = cars.filter((c) => c.row === cRow && Math.abs(c.stall - cStall) === 1);
  const others = cars.filter((c) => !beside.includes(c));
  const bosses = [...beside, ...shuffle(rng, others)].slice(0, spec.managers ?? 0);
  for (const c of bosses) {
    c.model = "manager";
    c.colour = "black";
    delete c.backIn;
  }
  const plain = () =>
    shuffle(
      rng,
      cars.filter((c) => c.model !== "manager" && !c.door && !c.reverse),
    );

  // Doors: one beside the cart's own stall (two would leave no way out), beside the corral,
  // then anywhere.
  const doorFirst = cars.filter(
    (c) =>
      c.model !== "manager" &&
      ((spec.spawnStall && c.row === spec.spawnStall[0] && c.stall - spec.spawnStall[1] === 1) ||
        beside.includes(c)),
  );
  for (const c of [...doorFirst, ...plain()].slice(0, spec.doors ?? 0)) {
    if (c.door) continue;
    delete c.backIn;
    // Open towards the stall the cart will be in when there is one.
    const target = beside.includes(c)
      ? cStall
      : (spec.spawnStall?.[1] ?? c.stall + (rng.next() < 0.5 ? 1 : -1));
    const east = target > c.stall;
    // Nose-in: a top-row car faces north, so its right is east; a bottom-row car faces south.
    c.door = (c.row === 0) === east ? "right" : "left";
  }

  // Reversing cars come from the row away from the traffic lane.
  const laneRow = lanes.length ? (lanes[0]!.y < 9 ? 0 : 1) : -1;
  const backers = plain().filter((c) => c.row !== laneRow && !beside.includes(c));
  for (const c of backers.slice(0, spec.reversers ?? 0)) {
    delete c.backIn;
    // Short of the traffic lane, so nobody backs into a moving car.
    c.reverse = {
      near: rng.range(3.6, 5.2),
      distance: lanes.length ? rng.range(1.3, 1.6) : rng.range(2, 2.4),
    };
  }

  const hazards: Hazard[] = [];
  for (const x of spec.bumps ?? [])
    hazards.push({ type: "speedBump", x, y: AISLE[0], w: 0.9, h: 6.8 });
  if (spec.slope) hazards.push({ type: "slope", x: 0, y: 0, w: W, h: H, ...spec.slope });
  if (spec.wind) hazards.push({ type: "wind", ...spec.wind });
  for (const lane of lanes) {
    const cycle = (W + 8) / lane.speed + lane.gap;
    for (let k = 0; k < lane.cars; k++) {
      hazards.push({
        type: "traffic",
        y: lane.y,
        dir: lane.dir,
        speed: lane.speed,
        gap: lane.gap,
        offset: Math.round(((k * cycle) / lane.cars + rng.range(0, cycle)) * 10) / 10,
        model: rng.pick(["sedan", "suv", "hatch", "pickup"] as const),
        colour: rng.pick(CAR_COLOURS),
      });
    }
  }

  // Things left in the aisle, clear of the start, the lanes and each other.
  const placed: [number, number][] = [[spec.spawn.x, spec.spawn.y]];
  const spot = (minGap: number): [number, number] | null => {
    for (let tries = 0; tries < 200; tries++) {
      const x = rng.range(4.5, W - 3);
      const y = rng.range(AISLE[0] + 0.7, AISLE[1] - 0.7);
      if (lanes.some((l) => Math.abs(y - l.y) < 1.6)) continue;
      if (placed.some(([px, py]) => Math.hypot(px - x, py - y) < minGap)) continue;
      if ((spec.bumps ?? []).some((b) => x > b - 0.6 && x < b + 1.5)) continue;
      placed.push([x, y]);
      return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
    }
    return null;
  };
  for (let k = 0; k < (spec.carts ?? 0); k++) {
    const p = spot(2.6);
    if (p)
      hazards.push({
        type: "cart",
        x: p[0],
        y: p[1],
        heading: Math.round(rng.range(-3, 3) * 10) / 10,
      });
  }
  for (let k = 0; k < (spec.cones ?? 0); k++) {
    const p = spot(1.5);
    if (p) hazards.push({ type: "cone", x: p[0], y: p[1] });
  }
  // A closed stall with cones in it, when there's an empty one.
  if (empty.length) {
    const [row, stall] = rng.pick(empty);
    const cy = row === 0 ? 2.8 : 15.2;
    for (let k = 0; k < 3; k++)
      hazards.push({
        type: "cone",
        x: Math.round((stallX(stall) + rng.range(-0.8, 0.8)) * 10) / 10,
        y: Math.round((cy + (k - 1) * 1.3) * 10) / 10,
      });
  }

  const paint: Paint[] = [];
  if (lanes.length) {
    for (const lane of lanes)
      for (const x of [5, 16, 27])
        paint.push({ type: "arrow", x, y: lane.y, dir: lane.dir === 1 ? 0 : 3.141593 });
  } else {
    for (const x of [3.5, 16, 28.5]) paint.push({ type: "arrow", x, y: 9, dir: 0 });
  }
  paint.push({
    type: "text",
    text: "CARRINHOS",
    x: stallX(cStall),
    y: cRow === 0 ? 6.6 : 11.3,
    size: 0.7,
  });
  for (const c of bosses)
    paint.push({
      type: "text",
      text: "GERENTE",
      x: stallX(c.stall),
      y: c.row === 0 ? 0.9 : 17.1,
      size: 0.6,
    });

  return {
    id: spec.id,
    size: [W, H],
    seed: spec.seed,
    spawn: spec.spawn,
    corral: spec.corral,
    surface: spec.surface ?? "dry",
    limit: spec.limit * 100,
    rows: [
      { x: 0.4, y: 0, stalls: 12, opens: "down" },
      { x: 0.4, y: 12.4, stalls: 12, opens: "up" },
    ],
    cars,
    hazards,
    paint,
  };
}

function shuffle<T>(rng: Rng, list: T[]): T[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Why the bot couldn't do it: what one plain run ends with (for tuning the specs). */
function diagnose(level: Level): string {
  const out: string[] = [];
  for (const gate of [undefined, 0.4 + level.corral.stall * 2.6 + 1.3, level.spawn.x]) {
    const run = drive(level, "standard", { margin: 0.45, cruise: 1.4, timeout: 90, gate });
    out.push(
      run
        ? `gate ${gate}: ${run.world.status} ${run.world.failReason ?? ""} t=${(run.world.tick / TICK_RATE).toFixed(0)}s ${run.world.receipt.map((l) => l.kind + ("zone" in l ? ":" + l.zone : "") + "@" + (l.tick / TICK_RATE).toFixed(0)).join(",")}`
        : `gate ${gate}: no path`,
    );
  }
  return out.join(" | ");
}

/** Every cart that another cart's unlock depends on, besides the standard one. */
const GATING_CARTS = ["rusty", "basket", "kiddie"] as const;
const CART_PARS_FILE = "tests/content/cart-pars.json";
const cartPars: Record<string, Record<string, string>> = existsSync(CART_PARS_FILE)
  ? (JSON.parse(readFileSync(CART_PARS_FILE, "utf8")) as Record<string, Record<string, string>>)
  : {};

const only = process.argv.slice(2);
let failed = 0;
for (const spec of SPECS) {
  if (only.length && !only.includes(spec.id)) continue;
  let done = false;
  for (let attempt = 0; attempt < 40 && !done; attempt++) {
    const level = build(spec, attempt);
    const v = validateLevel(level);
    if (!v.ok) continue;
    const run = findPar(level);
    // Carts unlock by finishing every level with the cart before, so each cart that gates
    // another has to be able to: the bot proves it for those too.
    const others: Record<string, string> = {};
    let allCarts = !!run;
    for (const cart of GATING_CARTS) {
      if (!allCarts) break;
      const r = findPar(level, cart);
      if (r) others[cart] = encodeInputs(r.inputs);
      else allCarts = false;
    }
    if (run && !allCarts) {
      if (process.env.DIAG)
        console.log(
          `  ${spec.id} #${attempt}: fine for the standard cart, not for all of ${GATING_CARTS.join(", ")}`,
        );
      continue;
    }
    if (process.env.DIAG && !run && attempt < 3)
      console.log(`  ${spec.id} #${attempt}: ${diagnose(level)}`);
    if (!run || run.world.endTick > 55 * TICK_RATE) continue;
    level.par = { cart: "standard", inputs: encodeInputs(run.inputs) };
    cartPars[spec.id] = others;
    writeFileSync(
      join("src/content/levels", `${spec.id}.json`),
      JSON.stringify(level, null, 2) + "\n",
    );
    const count = (t: string) => level.hazards.filter((h) => h.type === t).length;
    console.log(
      `${spec.id}: attempt ${attempt + 1}, par ${(run.world.endTick / TICK_RATE).toFixed(1)} s, limit R$ ${spec.limit}, ` +
        `${level.cars.length} cars, ${count("cone")} cones, ${count("cart")} carts, ${count("traffic")} traffic`,
    );
    done = true;
  }
  if (!done) {
    console.error(`${spec.id}: no level the bot could park in 40 attempts. Ease the spec.`);
    failed++;
  }
}
// The other carts' proof runs are only for the tests, so they stay out of the game's bundle.
writeFileSync(CART_PARS_FILE, JSON.stringify(cartPars, null, 1) + "\n");
if (failed) process.exit(1);
