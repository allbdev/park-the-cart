import { CAR_COLOURS, CAR_MODELS, CAR_SPECS } from "../content/cars";
import { CARTS } from "../content/carts";
import { corners, makeBox } from "./body";
import { stallRect, type Level } from "./level";
import { createWorld, solidAt } from "./world";

/**
 * Checks a level read from JSON before it's played. Hand-written on purpose (no schema library):
 * the shapes are small and the errors say exactly what's wrong.
 */
export type Validation = { ok: true; level: Level } | { ok: false; errors: string[] };

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const HAZARD_FIELDS: Record<string, readonly string[]> = {
  speedBump: ["x", "y", "w", "h"],
  cone: ["x", "y"],
  cart: ["x", "y", "heading"],
  island: ["x", "y", "w", "h"],
  slope: ["x", "y", "w", "h", "dir", "accel"],
  wind: ["dir", "accel"],
};

export function validateLevel(raw: unknown): Validation {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ["level is not an object"] };
  const L = raw as Partial<Level> & Record<string, unknown>;
  if (typeof L.id !== "string" || !/^[a-z0-9-]{1,40}$/.test(L.id)) errors.push("bad id");
  if (
    !Array.isArray(L.size) ||
    L.size.length !== 2 ||
    !L.size.every((n) => isNum(n) && n > 4 && n < 200)
  )
    errors.push("bad size");
  if (!isNum(L.seed)) errors.push("bad seed");
  if (L.surface !== "dry" && L.surface !== "wet") errors.push("bad surface");
  if (!isObj(L.spawn) || !isNum(L.spawn.x) || !isNum(L.spawn.y) || !isNum(L.spawn.heading))
    errors.push("bad spawn");
  if (!Array.isArray(L.rows) || L.rows.length === 0) errors.push("no rows");
  else
    L.rows.forEach((r, i) => {
      if (!isObj(r) || !isNum(r.x) || !isNum(r.y) || !isNum(r.stalls) || r.stalls < 1)
        errors.push(`row ${i}: bad shape`);
      else if (r.opens !== "up" && r.opens !== "down") errors.push(`row ${i}: bad opens`);
    });
  if (!Array.isArray(L.cars)) errors.push("no cars list");
  if (!Array.isArray(L.hazards)) errors.push("no hazards list");
  if (!isObj(L.corral) || !isNum(L.corral.row) || !isNum(L.corral.stall)) errors.push("bad corral");
  if (errors.length) return { ok: false, errors };

  const level = L as Level;
  const stallOk = (row: number, stall: number) =>
    Number.isInteger(row) &&
    Number.isInteger(stall) &&
    row >= 0 &&
    row < level.rows.length &&
    stall >= 0 &&
    stall < level.rows[row]!.stalls;
  if (!stallOk(level.corral.row, level.corral.stall)) errors.push("corral is not a stall");

  const taken = new Set<string>([`${level.corral.row}:${level.corral.stall}`]);
  level.cars.forEach((c, i) => {
    if (!isObj(c)) return errors.push(`car ${i}: bad shape`);
    if (!stallOk(c.row, c.stall)) errors.push(`car ${i}: not a stall`);
    if (!CAR_MODELS.includes(c.model)) errors.push(`car ${i}: unknown model`);
    if (!CAR_COLOURS.includes(c.colour)) errors.push(`car ${i}: unknown colour`);
    const key = `${c.row}:${c.stall}`;
    if (taken.has(key)) errors.push(`car ${i}: stall taken`);
    taken.add(key);
    if (c.door !== undefined && c.door !== "left" && c.door !== "right")
      errors.push(`car ${i}: bad door`);
    if (c.reverse !== undefined && (!isObj(c.reverse) || !isNum(c.reverse.distance)))
      errors.push(`car ${i}: bad reverse`);
  });

  let winds = 0;
  level.hazards.forEach((h, i) => {
    if (!isObj(h) || typeof h.type !== "string" || !(h.type in HAZARD_FIELDS))
      return errors.push(`hazard ${i}: unknown type`);
    for (const f of HAZARD_FIELDS[h.type]!)
      if (!isNum((h as unknown as Record<string, unknown>)[f]))
        errors.push(`hazard ${i}: bad ${f}`);
    if (h.type === "wind") winds++;
  });
  if (winds > 1) errors.push("more than one wind");
  if (errors.length) return { ok: false, errors };

  // Geometry: rows inside the lot, the spawn clear, cones clear.
  const [W, H] = level.size;
  for (const [i, r] of level.rows.entries()) {
    const last = stallRect(r, r.stalls - 1);
    if (r.x < 0 || r.y < 0 || last.x + last.w > W + 1e-9 || last.y + last.h > H + 1e-9)
      errors.push(`row ${i}: outside the lot`);
  }
  for (const [i, c] of level.cars.entries()) {
    if (CAR_SPECS[c.model].length > stallRect(level.rows[c.row]!, c.stall).h - 0.3)
      errors.push(`car ${i}: too long for its stall`);
  }
  if (errors.length) return { ok: false, errors };

  const world = createWorld(level, "standard");
  const spec = CARTS.standard;
  const ghost = makeBox(level.spawn.x, level.spawn.y, level.spawn.heading, spec.length, spec.width);
  const pts = corners(ghost, []);
  for (let k = 0; k < 8; k += 2) {
    if (solidAt(world, pts[k]!, pts[k + 1]!)) {
      errors.push("spawn overlaps something solid");
      break;
    }
  }
  for (const [i, h] of level.hazards.entries()) {
    if (h.type === "cone" && solidAt(world, h.x, h.y))
      errors.push(`hazard ${i}: cone inside something`);
  }
  // The corral must fit the biggest cart with room to spare.
  if (world.corral.w < 1.6 || world.corral.h < 2.2) errors.push("corral too small");
  return errors.length ? { ok: false, errors } : { ok: true, level };
}
