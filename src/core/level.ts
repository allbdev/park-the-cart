import type { CarColour, CarModel } from "../content/cars";

/**
 * A level as written in src/content/levels/*.json. Metres; x right, y down; headings in
 * radians with 0 = +x. Rectangles are { x, y, w, h } from the top-left corner.
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A row of parking stalls. `opens` is the side the aisle is on. */
export interface Row {
  x: number;
  y: number;
  stalls: number;
  stallWidth?: number;
  depth?: number;
  opens: "up" | "down";
}

export interface LevelCar {
  row: number;
  stall: number;
  model: CarModel;
  colour: CarColour;
  /** Parked backwards (nose to the aisle). */
  backIn?: boolean;
  /** Small offsets: sideways in the stall (m) and a crooked angle (rad). */
  shift?: number;
  tilt?: number;
  /** A door that opens when the cart passes on that side (relative to the car's heading). */
  door?: "left" | "right";
  /** Backs out of the stall into the aisle, at a time or when the cart comes near. */
  reverse?: { at?: number; near?: number; distance: number };
}

export type Hazard =
  | { type: "speedBump"; x: number; y: number; w: number; h: number }
  | { type: "cone"; x: number; y: number }
  | { type: "cart"; x: number; y: number; heading: number }
  | { type: "island"; x: number; y: number; w: number; h: number }
  | { type: "slope"; x: number; y: number; w: number; h: number; dir: number; accel: number }
  | { type: "wind"; dir: number; accel: number };

export type Paint =
  | { type: "text"; text: string; x: number; y: number; rot?: number; size?: number }
  | { type: "arrow"; x: number; y: number; dir: number }
  | { type: "hatch"; x: number; y: number; w: number; h: number };

export interface Level {
  id: string;
  /** Lot width and height. */
  size: [number, number];
  /** Seed for the caster's phases, gusts and bump kicks. */
  seed: number;
  spawn: { x: number; y: number; heading: number };
  /** The corral occupies one stall; its open side faces the aisle. */
  corral: { row: number; stall: number };
  surface: "dry" | "wet";
  rows: Row[];
  cars: LevelCar[];
  hazards: Hazard[];
  paint?: Paint[];
  /** A recorded run that parks with R$ 0 (encoded inputs, see replay.ts). */
  par?: { cart: string; inputs: string };
}

export const STALL_WIDTH = 2.6;
export const STALL_DEPTH = 5.6;

export function stallRect(row: Row, stall: number): Rect {
  const w = row.stallWidth ?? STALL_WIDTH;
  return { x: row.x + stall * w, y: row.y, w, h: row.depth ?? STALL_DEPTH };
}

/** Where a car sits in its stall: centre and heading. Nose-in by default. */
export function carPlacement(
  row: Row,
  car: Pick<LevelCar, "stall" | "backIn" | "shift" | "tilt">,
  length: number,
): { x: number; y: number; a: number } {
  const r = stallRect(row, car.stall);
  const gap = 0.35;
  const intoStall = row.opens === "down" ? -1 : 1; // direction from the aisle into the stall
  const closedY = row.opens === "down" ? r.y : r.y + r.h;
  const y = closedY - intoStall * (gap + length / 2);
  let a = intoStall === -1 ? -Math.PI / 2 : Math.PI / 2;
  if (car.backIn) a += Math.PI;
  return { x: r.x + r.w / 2 + (car.shift ?? 0), y, a: a + (car.tilt ?? 0) };
}
