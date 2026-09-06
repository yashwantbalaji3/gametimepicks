#!/usr/bin/env node
/**
 * Gate product generation on its input actually being there, for the right date, fresh and complete.
 *
 *   npx tsx app/scripts/products/check-pool-ready.mjs --date 2026-09-06
 *
 * Exit 0  the pool is usable (OK), or the slate is validly empty (INPUT_EMPTY — an off day).
 * Exit 20-23  a named refusal: missing / wrong date / malformed / stale.
 *
 * A refusal is a handled condition and prints why. It is never reported as successful generation.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkTeamMarketPool, EXIT } from "../../src/lib/daily-portfolio/pool-gate.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const date = arg("--date", new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }));
const root = arg("--root", path.join(APP, "public", "data"));
const nowIso = arg("--now", new Date().toISOString());

const r = checkTeamMarketPool({ root, date, nowIso });
const code = EXIT[r.verdict] ?? 1;
console.log(`pool-gate ${date}: ${r.verdict} — ${r.detail}`);
if (process.env.GITHUB_OUTPUT) {
  const fs = await import("node:fs");
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `verdict=${r.verdict}\ngames=${r.games}\n`);
}
if (code !== 0) console.log(`::warning::product generation refused — ${r.verdict}: ${r.detail}`);
process.exit(code);
