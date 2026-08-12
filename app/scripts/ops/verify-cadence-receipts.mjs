/**
 * One-command cadence receipt verification (Program 163 · Release C).
 *
 * Usage (AFTER the scheduled run completes and its bot commits are pulled):
 *   node scripts/ops/verify-cadence-receipts.mjs --run <run-id> --before <ref>
 *
 * `--before` is the commit BEFORE the run's bot commits (e.g. the SHA you held before pulling).
 * This script GATHERS — run metadata via gh, prior manifests via `git show <ref>:<path>`, current
 * manifests from the working tree, per-results reconciliation via the sport adapters — and the
 * pure evaluator (src/lib/ops/receipt-verifier.mjs) JUDGES. It never dispatches or polls a run.
 *
 * Every committed class uses stamp-stripped idempotent commits, so an unchanged day legitimately
 * leaves the file untouched (RETAINED_LKG): the acquisition proof for those days is the run's own
 * step log, which this script points at rather than re-deriving.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import crypto from "node:crypto";

import { verifyCadenceReceipts } from "../../src/lib/ops/receipt-verifier.mjs";
import { CADENCE_EXPECTATIONS } from "../../src/lib/ops/cadence-expectations.mjs";
import { loadCurrentNflResults } from "../../src/lib/sports/nfl/current-results.mjs";
import { loadCurrentNbaResults } from "../../src/lib/sports/nba/current-results.mjs";
import { loadCurrentUfcResults } from "../../src/lib/sports/ufc/current-results.mjs";
import { loadCurrentEplResults } from "../../src/lib/soccer/epl-current-results.mjs";

const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const RUN_ID = arg("--run");
const BEFORE = arg("--before");
if (!RUN_ID || !BEFORE) { console.error("usage: verify-cadence-receipts.mjs --run <run-id> --before <ref>"); process.exit(1); }

const REPO = "yashwantbalaji3/gametimepicks";
const PATHS = {
  "nfl-schedule": "app/public/data/nfl/schedule/latest.json",
  "nba-schedule": "app/public/data/nba/schedule/latest.json",
  "ufc-schedule": "app/public/data/ufc/schedule/latest.json",
  "epl-fixtures": null, // snapshot-per-capture: newest capture-*.json is located dynamically
  "nfl-results": "app/public/data/nfl/results/latest.json",
  "nba-results": "app/public/data/nba/results/latest.json",
  "ufc-results": "app/public/data/ufc/results/latest.json",
  "epl-results": "app/public/data/soccer/epl/results/latest.json",
  "injuries-nfl": "data/internal/research/injuries/nfl/latest.json",
  "injuries-nba": "data/internal/research/injuries/nba/latest.json",
};
const ADAPTERS = {
  "nfl-results": loadCurrentNflResults,
  "nba-results": loadCurrentNbaResults,
  "ufc-results": loadCurrentUfcResults,
  "epl-results": loadCurrentEplResults,
};

const stripStamps = (obj) => {
  const clone = JSON.parse(JSON.stringify(obj));
  delete clone.generatedAt; delete clone.sourceAsOf;
  if (Array.isArray(clone.rows)) clone.rows = clone.rows.map(({ capturedAt, ...rest }) => rest);
  if (Array.isArray(clone.entries)) clone.entries = clone.entries.map(({ capturedAt, ...rest }) => rest);
  return JSON.stringify(clone);
};
const countsOf = (a) => ({ rows: (a.rows ?? a.entries ?? []).length, completed: a.completedCount ?? 0 });

function manifest(clsId, raw) {
  if (!raw) return null;
  const a = JSON.parse(raw);
  const m = { generatedAt: a.generatedAt ?? null, sourceAsOf: a.sourceAsOf ?? null, semanticHash: crypto.createHash("md5").update(stripStamps(a)).digest("hex"), counts: countsOf(a), state: a.state ?? null };
  const adapter = ADAPTERS[clsId];
  if (adapter) {
    const nowIso = new Date(Date.parse(a.sourceAsOf ?? a.generatedAt ?? Date.now()) + 3_600_000).toISOString();
    const out = adapter({ nowIso, artifact: a });
    m.state = out.state;
    m.reconciliationExact = out.reconciliation ? out.reconciliation.exact : true;
    m.adapterSummary = out.reconciliation ?? null;
  }
  return m;
}

const gitShow = (ref, p) => { try { return execSync(`git show ${ref}:${p}`, { encoding: "utf8", cwd: process.cwd() + "/.." }); } catch { return null; } };
const readNow = (p) => { try { return fs.readFileSync(`../${p}`, "utf8"); } catch { return null; } };

const run = JSON.parse(execSync(`gh run view ${RUN_ID} --repo ${REPO} --json databaseId,event,workflowName,conclusion,createdAt`, { encoding: "utf8" }));
const manifests = {};
for (const [cls, p] of Object.entries(PATHS)) {
  if (!p) continue; // epl-fixtures snapshot lineage is covered by its own guards; retention allowed
  manifests[cls] = { prior: manifest(cls, gitShow(BEFORE, p)), current: manifest(cls, readNow(p)) };
}

const result = verifyCadenceReceipts({ run: { id: String(run.databaseId), event: run.event, workflowName: run.workflowName, conclusion: run.conclusion }, manifests, expectations: CADENCE_EXPECTATIONS });
console.log(`run ${result.run.id}: qualifying=${result.run.qualifying} (${result.run.reason})`);
for (const r of result.receipts) console.log(`  [${r.verdict}] ${r.class} — ${r.evidence}`);
console.log(`failures: ${result.failures.length}${result.failures.length ? " — inspect the run log per class: gh run view " + RUN_ID + " --log" : ""}`);
process.exit(result.failures.length === 0 && result.run.qualifying ? 0 : 2);
