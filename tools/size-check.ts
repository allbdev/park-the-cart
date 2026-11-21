/**
 * Fails when the built JS + CSS (gzipped, fonts and images aside) goes over the budget in
 * CLAUDE.md. Runs as part of `npm run check`, after the build.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const BUDGET_BYTES = 200 * 1024;
const dir = "dist/assets";
let total = 0;
for (const file of readdirSync(dir)) {
  if (!/\.(js|css)$/.test(file)) continue;
  const size = gzipSync(readFileSync(join(dir, file))).length;
  total += size;
  console.log(`${file.padEnd(32)} ${(size / 1024).toFixed(1)} KB gzipped`);
}
console.log(`total ${(total / 1024).toFixed(1)} KB of ${BUDGET_BYTES / 1024} KB budget`);
if (total > BUDGET_BYTES) {
  console.error("Over the performance budget (CLAUDE.md).");
  process.exit(1);
}
