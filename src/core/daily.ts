import { CAR_COLOURS, type CarColour, type CarModel } from "../content/cars";
import { findPar } from "./bot";
import type { Hazard, Level, LevelCar, Paint } from "./level";
import { HALF_PI } from "./math";
import { encodeInputs } from "./replay";
import { createRng, type Rng } from "./rng";
import { validateLevel } from "./validate";

/**
 * The daily level: a car park drawn from the date, the same for everyone. The generator picks a
 * layout and hazards from the date's seed, then the parking bot must park it with R$ 0 within
 * the time bound; if it can't, the generator re-rolls (with the attempt number in the seed), so
 * every day is finishable by construction. Dates come in as input: no clock in the core.
 */

export const DAILY_BOUND_SECONDS = 45;
const MAX_ATTEMPTS = 24;
/** The daily card limit: one door and a cone or two, in centavos. */
export const DAILY_LIMIT = 200_000;

/** "2026-11-20" from a year, month (1-12) and day. */
export function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isDateKey(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [, m, d] = s.split("-").map(Number) as [number, number, number];
  return m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

const TOP = { x: 0.4, y: 0, stalls: 12, opens: "down" as const };
const BOTTOM = { x: 0.4, y: 12.4, stalls: 12, opens: "up" as const };
const MODELS: readonly CarModel[] = [
  "sedan",
  "sedan",
  "sedan",
  "suv",
  "suv",
  "hatch",
  "hatch",
  "pickup",
];

function stallX(stall: number): number {
  return 0.4 + stall * 2.6 + 1.3;
}

/** One candidate layout for a seed. Not yet checked. */
export function generateCandidate(key: string, attempt: number): Level {
  const rng = createRng(`daily:${key}:${attempt}`);
  // Easier the more attempts it took: fewer cars, fewer hazards.
  const ease = Math.min(1, attempt / 12);
  const corralRow = rng.int(0, 1);
  const corralStall = rng.int(0, 11);
  const spawnRow = 1 - corralRow;
  // Spawn either at an aisle end or in an empty stall of the other row.
  const fromAisle = rng.next() < 0.5;
  const farSide = corralStall < 6 ? 11 : 0;
  const spawnStall = Math.max(0, Math.min(11, farSide + rng.int(-2, 2)));
  const spawn = fromAisle
    ? { x: corralStall < 6 ? 29.6 : 2.4, y: 9, heading: corralStall < 6 ? Math.PI : 0 }
    : {
        x: stallX(spawnStall),
        y: spawnRow === 1 ? 15.2 : 2.8,
        heading: spawnRow === 1 ? -HALF_PI : HALF_PI,
      };

  const fill = 0.75 - ease * 0.35 + rng.range(-0.1, 0.1);
  const cars: LevelCar[] = [];
  const empty: [number, number][] = [];
  let managers = rng.next() < 0.3 - ease * 0.3 ? 1 : 0;
  let doors = rng.int(0, 2) - Math.round(ease * 2);
  let reversers = rng.int(0, 2) - Math.round(ease * 2);
  for (let row = 0; row < 2; row++) {
    for (let stall = 0; stall < 12; stall++) {
      if (row === corralRow && stall === corralStall) continue;
      if (!fromAisle && row === spawnRow && stall === spawnStall) continue;
      if (rng.next() > fill) {
        empty.push([row, stall]);
        continue;
      }
      let model = rng.pick(MODELS);
      let colour: CarColour = rng.pick(CAR_COLOURS);
      if (managers > 0 && rng.next() < 0.15) {
        model = "manager";
        colour = "black";
        managers--;
      }
      const car: LevelCar = { row, stall, model, colour };
      if (rng.next() < 0.15) car.backIn = true;
      if (model !== "manager" && !car.backIn) {
        if (doors > 0 && rng.next() < 0.2) {
          car.door = rng.next() < 0.5 ? "left" : "right";
          doors--;
        } else if (reversers > 0 && rng.next() < 0.15) {
          car.reverse =
            rng.next() < 0.5
              ? { near: rng.range(3.5, 5.5), distance: rng.range(2.2, 3.2) }
              : { at: rng.range(4, 14), distance: rng.range(2.2, 3.2) };
          reversers--;
        }
      }
      if (rng.next() < 0.3) car.shift = rng.range(-0.25, 0.25);
      if (rng.next() < 0.25) car.tilt = rng.range(-0.06, 0.06);
      cars.push(car);
    }
  }

  const hazards: Hazard[] = [];
  const paint: Paint[] = [
    { type: "arrow", x: 3.5, y: 9, dir: 0 },
    { type: "arrow", x: 16, y: 9, dir: 0 },
    { type: "arrow", x: 28.5, y: 9, dir: 0 },
    {
      type: "text",
      text: "CARRINHOS",
      x: stallX(corralStall),
      y: corralRow === 0 ? 6.6 : 11.4,
      size: 0.7,
    },
  ];
  const roll = (p: number) => rng.next() < p * (1 - ease * 0.8);
  if (roll(0.5)) {
    hazards.push({ type: "speedBump", x: rng.range(8, 23), y: 5.6, w: 0.9, h: 6.8 });
  }
  if (roll(0.55) && empty.length) {
    const [row, stall] = rng.pick(empty);
    const cx = stallX(stall);
    const cy = row === 0 ? 2.8 : 15.2;
    const n = rng.int(2, 3);
    for (let k = 0; k < n; k++)
      hazards.push({ type: "cone", x: cx + rng.range(-0.8, 0.8), y: cy + rng.range(-1.6, 1.6) });
    if (row === 0) paint.push({ type: "text", text: "IDOSO", x: cx, y: 1.2, size: 0.6 });
  }
  if (roll(0.4))
    hazards.push({
      type: "cart",
      x: rng.range(9, 23),
      y: rng.range(7.6, 10.4),
      heading: rng.range(-3, 3),
    });
  if (roll(0.25)) hazards.push({ type: "cone", x: rng.range(8, 24), y: rng.range(7.2, 10.8) });
  let surface: "dry" | "wet" = "dry";
  const weather = rng.next();
  if (weather < 0.18 * (1 - ease)) surface = "wet";
  else if (weather < 0.36 * (1 - ease))
    hazards.push({
      type: "wind",
      dir: rng.next() < 0.5 ? -HALF_PI : HALF_PI,
      accel: rng.range(0.6, 1.2),
    });
  else if (weather < 0.48 * (1 - ease))
    hazards.push({
      type: "slope",
      x: 0,
      y: 0,
      w: 32,
      h: 18,
      dir: rng.pick([0, Math.PI, HALF_PI, -HALF_PI]),
      accel: rng.range(0.3, 0.5),
    });

  return {
    id: `daily-${key}`,
    size: [32, 18],
    seed: rng.int(1, 1_000_000),
    spawn,
    corral: { row: corralRow, stall: corralStall },
    surface,
    limit: DAILY_LIMIT,
    rows: [TOP, BOTTOM],
    cars,
    hazards,
    paint,
  };
}

export interface Daily {
  level: Level;
  attempts: number;
  /** The bot's time, in ticks. */
  parTicks: number;
}

/** The day's level: the first candidate that's valid and that the bot parks with R$ 0 in time. */
export function dailyLevel(key: string): Daily {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const level = generateCandidate(key, attempt);
    if (!validateLevel(level).ok) continue;
    const run = findPar(level);
    if (!run || run.world.endTick > DAILY_BOUND_SECONDS * 120) continue;
    return {
      level: { ...level, par: { cart: "standard", inputs: encodeInputs(run.inputs) } },
      attempts: attempt + 1,
      parTicks: run.world.endTick,
    };
  }
  return { level: fallback(key), attempts: MAX_ATTEMPTS, parTicks: 0 };
}

/** An almost empty lot, used only if every attempt fails (never seen in the tests). */
function fallback(key: string): Level {
  const rng: Rng = createRng(`fallback:${key}`);
  return {
    id: `daily-${key}`,
    size: [32, 18],
    seed: 1,
    spawn: { x: 2.4, y: 9, heading: 0 },
    corral: { row: 0, stall: 9 },
    surface: "dry",
    rows: [TOP, BOTTOM],
    cars: [{ row: 0, stall: 3, model: "sedan", colour: rng.pick(CAR_COLOURS) }],
    hazards: [],
    paint: [],
  };
}
