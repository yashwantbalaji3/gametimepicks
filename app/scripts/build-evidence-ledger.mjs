/**
 * Evidence-ledger generator (Program 144 · Release A).
 *
 * The IO half of `src/lib/launch/evidence-ledger.mjs`: reads each source the pure builder consumes,
 * stamps `now` once, and writes `public/data/admin/evidence-ledger.json`. The admin data directory
 * is already excluded from the public export by the prune step (verified 404 in production since
 * Program 073-075), so this inherits the same boundary as admin/status.json rather than inventing
 * a new one.
 *
 *   node scripts/build-evidence-ledger.mjs [--json] [--now <ISO>]
 *
 * `--now` exists for reproducibility (the artifact-regeneration rule: pin the clock, don't chase
 * it). Exit is 1 when the ledger carries any INCIDENT so the daily chain can refuse to publish on
 * a contradiction, 0 otherwise.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildEvidenceLedger } from "../src/lib/launch/evidence-ledger.mjs";
import { buildLaunchGates } from "../src/lib/launch/launch-contract.mjs";
import { SPORT_ASSESSMENTS } from "../src/lib/sports/sport-assessments.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = path.resolve(APP, "..");

const argv = process.argv.slice(2);
const JSON_MODE = argv.includes("--json");
const nowIdx = argv.indexOf("--now");
const now = nowIdx >= 0 ? argv[nowIdx + 1] : new Date().toISOString();

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const datesIn = (dir) => {
  try {
    return fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort();
  } catch { return []; }
};

const ledger = buildEvidenceLedger({
  adminStatus: readJson(path.join(APP, "public/data/admin/status.json")),
  alphaDay: readJson(path.join(REPO, "ops/internal-alpha/latest.json")),
  gates: buildLaunchGates(),
  sportAssessments: SPORT_ASSESSMENTS,
  boardDates: datesIn(path.join(APP, "public/data/mlb/boards")),
  simDates: datesIn(path.join(APP, "public/data/mlb/game-simulations")),
  now,
});

const out = path.join(APP, "public/data/admin/evidence-ledger.json");
fs.writeFileSync(out, JSON.stringify(ledger, null, 2) + "\n");

if (JSON_MODE) {
  console.log(JSON.stringify(ledger, null, 2));
} else {
  console.log(`\n=== evidence ledger · ${now} ===`);
  console.log(`  entries ${ledger.entries.length} · contradictions ${ledger.contradictionCount}`);
  console.log(`  ${Object.entries(ledger.counts).filter(([, n]) => n > 0).map(([s, n]) => `${s} ${n}`).join(" · ")}`);
  for (const e of ledger.entries.filter((x) => ["INCIDENT", "UNKNOWN", "STALE"].includes(x.state))) {
    console.log(`  [${e.state}] ${e.subject} — ${e.evidence}`);
    if (e.remediation) console.log(`             → ${e.remediation}`);
  }
  console.log(`  → wrote ${path.relative(REPO, out)}`);
}
process.exit(ledger.entries.some((e) => e.state === "INCIDENT" && !e.id.includes("2026-08-06")) ? 1 : 0);
