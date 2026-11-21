/**
 * Records a par run for every level (or the ones named on the command line): the parking bot
 * drives the real simulation, and the fastest run that parks with R$ 0 is written into the
 * level's JSON as `par`. Re-run after any change to the cart model that breaks a par test.
 *
 *   npm run record-par                 # all levels
 *   npm run record-par -- 03-speed-bump
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findPar } from "../src/core/bot";
import { TICK_RATE } from "../src/core/cart";
import type { Level } from "../src/core/level";
import { encodeInputs } from "../src/core/replay";
import { validateLevel } from "../src/core/validate";
import { LEVELS } from "../src/content/levels";

const only = process.argv.slice(2);
let failed = 0;
for (const entry of LEVELS) {
  const id = entry.level.id;
  if (only.length && !only.includes(id)) continue;
  const file = join("src/content/levels", `${id}.json`);
  const level = JSON.parse(readFileSync(file, "utf8")) as Level;
  const v = validateLevel(level);
  if (!v.ok) {
    console.error(`${id}: invalid: ${v.errors.join("; ")}`);
    failed++;
    continue;
  }
  const run = findPar({ ...level, par: undefined });
  if (!run) {
    console.error(`${id}: the bot couldn't park it with R$ 0`);
    failed++;
    continue;
  }
  level.par = { cart: "standard", inputs: encodeInputs(run.inputs) };
  writeFileSync(file, JSON.stringify(level, null, 2) + "\n");
  console.log(`${id}: par ${(run.world.endTick / TICK_RATE).toFixed(1)} s`);
}
if (failed) process.exit(1);
