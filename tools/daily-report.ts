/**
 * Daily level statistics over many consecutive days: how many attempts the generator needed,
 * the bot's par time, and the hazards drawn. `npm run daily-report -- 2000`
 */
import { dailyLevel, dateKey } from "../src/core/daily";

const days = Number(process.argv[2] ?? 1000);
const attempts: number[] = [];
const pars: number[] = [];
const hazards = new Map<string, number>();
let fallbacks = 0;
const d = new Date(Date.UTC(2026, 10, 20));
const t0 = performance.now();
for (let i = 0; i < days; i++) {
  const r = dailyLevel(dateKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()));
  attempts.push(r.attempts);
  if (r.attempts >= 24) fallbacks++;
  pars.push(r.parTicks / 120);
  const kinds = new Set<string>(r.level.hazards.map((h) => h.type));
  if (r.level.surface === "wet") kinds.add("rain");
  if (r.level.cars.some((c) => c.door)) kinds.add("door");
  if (r.level.cars.some((c) => c.reverse)) kinds.add("reversing");
  if (r.level.cars.some((c) => c.model === "manager")) kinds.add("manager");
  for (const k of kinds) hazards.set(k, (hazards.get(k) ?? 0) + 1);
  d.setUTCDate(d.getUTCDate() + 1);
}
const q = (xs: number[], p: number) =>
  [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))]!;
console.log(`${days} days in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
console.log(
  `attempts  p50 ${q(attempts, 0.5)}  p90 ${q(attempts, 0.9)}  max ${Math.max(...attempts)}  fallbacks ${fallbacks}`,
);
console.log(
  `bot par   p10 ${q(pars, 0.1).toFixed(1)} s  p50 ${q(pars, 0.5).toFixed(1)} s  p90 ${q(pars, 0.9).toFixed(1)} s  max ${Math.max(...pars).toFixed(1)} s`,
);
console.log(
  "days with:",
  [...hazards].map(([k, n]) => `${k} ${((100 * n) / days).toFixed(0)}%`).join(", "),
);
