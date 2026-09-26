#!/usr/bin/env node
/**
 * THE MULTI-SPORT LIVE MATRIX — operator CLI.
 *
 * Usage:
 *   npx tsx app/scripts/ops/multisport-live-matrix.mjs
 *   npx tsx app/scripts/ops/multisport-live-matrix.mjs --date 2026-09-27
 *   npx tsx app/scripts/ops/multisport-live-matrix.mjs --json
 *
 * ⚠ RUN IT WITH `npx tsx`, NOT `node`. The matrix imports MLB's calibration verdicts from the
 * TypeScript module that is the single source of truth for whether a market may be presented as a
 * GameTimePicks forecast.
 *
 * The rules live in `src/lib/live/multisport-matrix.mjs` and are tested there, so they are
 * exercised without spawning anything.
 */
import { buildMultisportMatrix } from "../../src/lib/live/multisport-matrix.mjs";

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const JSON_OUT = argv.includes("--json");
const DATE = arg("date") ?? new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

const m = buildMultisportMatrix({ date: DATE });

if (JSON_OUT) {
  console.log(JSON.stringify({ ...m, generatedAt: new Date().toISOString() }, null, 2));
  process.exit(0);
}

console.log(`\nMULTI-SPORT LIVE MATRIX \u00b7 ${m.date}`);
console.log("(eligible = may be shown as a GameTimePicks forecast \u00b7 trackable = a free authoritative feed can state it by identity)\n");
let sport = null;
for (const r of m.rows) {
  if (r.sport !== sport) { sport = r.sport; console.log(`\u2500\u2500 ${sport} ${"\u2500".repeat(Math.max(0, 76 - sport.length))}`); }
  const mark = r.trackable ? "\u2713" : r.eligible ? "\u00b7" : "\u2717";
  console.log(`  ${mark} ${r.family.padEnd(26)} model=${String(r.modelState).padEnd(26)} ${r.trackable ? "LIVE-TRACKABLE" : ""}`);
  if (r.identity) console.log(`      identity  ${r.identity}`);
  if (r.frozenMarket) console.log(`      frozen    ${r.frozenMarket}`);
  if (r.liveField) console.log(`      live      ${r.liveField}`);
  if (!r.trackable && r.trackableReason) console.log(`      BLOCKED   ${r.trackableReason}`);
  console.log("");
}
console.log(`SUMMARY: ${m.summary.published} published families \u00b7 ${m.summary.eligible} product-eligible \u00b7 ${m.summary.trackable} live-trackable today\n`);
