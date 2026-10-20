#!/usr/bin/env node
/**
 * Cross-Product Prediction Consistency audit — READ-ONLY over committed artifacts.
 *
 *   npx tsx scripts/consistency/audit-prediction-consistency.mjs            # human summary
 *   npx tsx scripts/consistency/audit-prediction-consistency.mjs --json     # full audit JSON on stdout
 *   npx tsx scripts/consistency/audit-prediction-consistency.mjs --gate NFL:401873008
 *   npx tsx scripts/consistency/audit-prediction-consistency.mjs --event 401873008 --nba-date 2026-10-20
 *   npx tsx scripts/consistency/audit-prediction-consistency.mjs --write-baseline
 *
 * Writes nothing under data/ or app/public/. `--write-baseline` (explicit only) re-pins
 * app/src/lib/consistency/known-discrepancies.json. Exit code 1 when the audit has NEW strict discrepancies vs the
 * pinned baseline.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { baselineOf, compareWithBaseline, runConsistencyAudit, serializeBaseline, theaterActivationGate } from "../../src/lib/consistency/audit.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const baselinePath = path.join(repoRoot, "app/src/lib/consistency/known-discrepancies.json");

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const values = (n) => args.flatMap((a, i) => (a === n && args[i + 1] ? [args[i + 1]] : []));

const nflEvents = values("--event");
const nbaDates = values("--nba-date");
const audit = runConsistencyAudit({ repoRoot, nflEvents: nflEvents.length ? nflEvents : null, ...(nbaDates.length ? { nbaDates } : {}) });

if (flag("--write-baseline")) {
  if (nflEvents.length || nbaDates.length) { console.error("--write-baseline pins the full default audit; drop --event / --nba-date"); process.exit(2); }
  fs.writeFileSync(baselinePath, serializeBaseline(baselineOf(audit)));
  console.log(`pinned ${audit.discrepancies.length} discrepancies → ${path.relative(repoRoot, baselinePath)}`);
  process.exit(0);
}

const gates = values("--gate").map((g) => { const [sport, id] = g.split(":"); return theaterActivationGate(sport, id, { audit }); });

if (flag("--json")) {
  console.log(JSON.stringify({ ...audit, gates }, null, 2));
} else {
  console.log(`Prediction consistency audit — NFL ${audit.events.NFL.length} event(s), NBA ${audit.events.NBA.length} event(s), ${audit.discrepancies.length} discrepancy record(s)`);
  for (const r of audit.refusals) console.log(`  REFUSED ${r.sport} ${r.eventId}: ${r.message}`);
  console.log("\nsport  code                      records  items  errors  warnings");
  for (const s of audit.summary) console.log(`${s.sport.padEnd(6)} ${s.code.padEnd(25)} ${String(s.records).padStart(7)} ${String(s.items).padStart(6)} ${String(s.errors).padStart(7)} ${String(s.warnings).padStart(9)}`);
  const show = audit.discrepancies.filter((d) => !d.static && d.severity === "ERROR").slice(0, 25);
  if (show.length) console.log("\nfirst ERROR records:");
  for (const d of show) console.log(`  ${d.code} ${d.sport} ${d.eventId} ${d.surface} ${d.identity.family ?? ""}/${d.identity.field ?? ""} expected=${JSON.stringify(d.expected)} actual=${JSON.stringify(d.actual)} count=${d.count}`);
  const st = audit.discrepancies.filter((d) => d.static);
  if (st.length) console.log(`\nstatic source findings (${st.length}):`);
  for (const d of st) console.log(`  ${d.code} ${d.ruleId} ${d.location.join(", ")}`);
  for (const g of gates) console.log(`\ntheaterActivationGate(${g.sport}, ${g.eventId}): ${g.open ? "OPEN" : `BLOCKED by ${g.blockers.length}`}${g.blockers.map((b) => `\n  ${b.code} ${b.surface ?? ""} ${b.identity?.field ?? b.detail ?? ""}`).join("")}`);
}

if (fs.existsSync(baselinePath)) {
  const cmp = compareWithBaseline(audit, JSON.parse(fs.readFileSync(baselinePath, "utf8")));
  if (!flag("--json")) console.log(`\nvs baseline: ${cmp.newStrict.length} new, ${cmp.grown.length} grown, ${cmp.drift.length} data-drift, ${cmp.resolved.length} resolved`);
  if (cmp.newStrict.length || cmp.grown.length) process.exitCode = 1;
}
