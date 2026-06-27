/**
 * Lifecycle automation — locks that the canonical daily lifecycle (roll_to_next_day.sh) owns every stage,
 * the production smoke test + run report exist and are wired as post-deploy gates, and the health gate runs
 * inside the lifecycle. Source-level (fast); behavioural correctness is proven by running the scripts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repo = path.join(process.cwd(), "..");
const readRepo = (rel) => fs.readFileSync(path.join(repo, rel), "utf8");
const readApp = (rel) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

test("there is exactly ONE canonical lifecycle orchestrator (roll_to_next_day.sh)", () => {
  const roll = readRepo("scripts/roll_to_next_day.sh");
  // It owns the full chain: settle → reconcile/gate → projections → all four products → build → deploy → smoke.
  assert.match(roll, /settle_soccer_day\.sh/, "settles the prior day");
  assert.match(roll, /gate\b/, "runs the money/health gate");
  assert.match(roll, /activate-daily-portfolio/, "generates Bank Builder + Moonshot");
  assert.match(roll, /world-cup-specials|refresh.*specials|specials/i, "refreshes WC Specials");
  assert.match(roll, /homer|ingest-mlb-slate/i, "ingests Homer Nukes");
  assert.match(roll, /smoke-test-production\.mjs/, "post-deploy production smoke test");
  assert.match(roll, /write-run-report\.mjs/, "emits a run report");
});

test("production smoke test derives expected money from canonical (no hardcoded values)", () => {
  const s = readApp("scripts/smoke-test-production.mjs");
  assert.match(s, /portfolio\.json/, "reads canonical portfolio for expected values");
  assert.match(s, /currentBankroll/, "checks the live bankroll against canonical");
  assert.match(s, /crownBankroll/, "checks the live crown against canonical");
  assert.match(s, /process\.exit\(1\)/, "fails the deploy on drift");
  // anti-hardcode: must not bake a dollar literal into the assertion.
  assert.ok(!/20,065\.40|20065\.4/.test(s), "no hardcoded bankroll literal in the smoke test");
});

test("run report captures the required observability fields, money from canonical", () => {
  const r = readApp("scripts/write-run-report.mjs");
  for (const field of ["settledDay", "mode", "deployed", "smoke", "durationSec", "products", "warnings", "deployUrl"]) {
    assert.ok(r.includes(field), `report includes ${field}`);
  }
  assert.match(r, /portfolio\.currentBankroll/, "money snapshot derives from canonical portfolio");
  assert.ok(!/20065\.4|20,065/.test(r), "no hardcoded bankroll literal in the report writer");
});

test("the lifecycle gate runs all three money guards (integrity + forensic + health)", () => {
  const roll = readRepo("scripts/roll_to_next_day.sh");
  assert.match(roll, /verify-money-integrity\.mjs/, "money-integrity in the gate");
  assert.match(roll, /forensic-money-audit\.mjs/, "forensic audit in the gate");
  assert.match(roll, /health-check\.mjs/, "health check in the gate");
});
