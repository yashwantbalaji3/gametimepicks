/**
 * audit-ufc-readiness — READ-ONLY guard that the UFC readiness artifact is honest
 * and FAIL-CLOSED: picks/parlays can never be "ready" unless every prerequisite
 * provider gate is genuinely true. No paid calls, no data change.
 *
 * Run: cd app && npx tsx scripts/audit-ufc-readiness.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ART = resolve(__dirname, "..", "public", "data", "ufc", "readiness-latest.json");

let fails = 0;
const fail = (m) => { console.error(`  FAIL: ${m}`); fails++; };

if (!existsSync(ART)) { console.error("FAIL: readiness-latest.json missing"); process.exit(1); }
const r = JSON.parse(readFileSync(ART, "utf8"));

for (const k of ["scheduleReady", "oddsReady", "fighterStatsReady", "gradingReady",
  "backtestReady", "projectionsReady", "parlayReady", "publicLevel", "blockers", "publicMessage"]) {
  if (!(k in r)) fail(`missing field ${k}`);
}
// Fail-closed invariants.
if (r.projectionsReady && !(r.scheduleReady && r.oddsReady && r.fighterStatsReady && r.gradingReady))
  fail("projectionsReady true without schedule+odds+stats+grading");
if (r.parlayReady && !(r.projectionsReady && r.backtestReady))
  fail("parlayReady true without projections + backtest");
// No banned certainty copy in the public message.
for (const banned of ["lock", "guaranteed", "guarantee", "sure thing", "safe", "risk-free", "can't miss"]) {
  if (String(r.publicMessage || "").toLowerCase().includes(banned)) fail(`public copy contains "${banned}"`);
}
if (fails === 0) console.log(`UFC readiness OK — publicLevel=${r.publicLevel}, projectionsReady=${r.projectionsReady}, parlayReady=${r.parlayReady} (fail-closed)`);
process.exit(fails ? 1 : 0);
