/**
 * Health-check deploy gate — locks that the production health check exists, COMPOSES the canonical money
 * checker (no duplicate logic), covers the structural/reconciliation/hygiene/freshness checks, and is
 * WIRED as a hard abort into every publishing path (nightly settle, soccer settle, roll-forward, morning
 * projections). Source-level so it runs in the fast suite; behavioural correctness is proven by running
 * the script (passes on canonical data, exits non-zero on a corrupted copy).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repo = path.join(process.cwd(), "..");
const read = (rel) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const readRepo = (rel) => fs.readFileSync(path.join(repo, rel), "utf8");

test("health-check.mjs exists and COMPOSES the canonical money checker (no duplicate money logic)", () => {
  const src = read("scripts/health-check.mjs");
  assert.match(src, /import \{ checkMoneyIntegrity \} from/, "reuses checkMoneyIntegrity instead of re-implementing money rules");
  assert.match(src, /process\.exit\(1\)/, "exits non-zero on critical failure (deploy gate)");
});

test("health-check covers structural + reconciliation + hygiene + product checks", () => {
  const src = read("scripts/health-check.mjs");
  for (const f of ["portfolio.json", "ledger.json", "daily-summary.json", "banked-ladders.json"]) {
    assert.ok(src.includes(f), `verifies canonical file ${f}`);
  }
  assert.match(src, /reconcile:ledger.*bankroll/, "reconciles ledger Σ + seed == bankroll");
  assert.match(src, /reconcile:crown/, "reconciles crown == Σ banked finals");
  assert.match(src, /day-chain/, "verifies the day chain is continuous");
  assert.match(src, /duplicate-event-id/, "detects duplicate event IDs");
  assert.match(src, /freshness/, "checks data freshness");
});

test("the health gate is wired into EVERY publishing path (hard abort)", () => {
  assert.match(read("scripts/health-check.mjs"), /HEALTHY|HEALTH CHECK/, "health-check emits a clear verdict");
  // shell orchestrators
  assert.match(readRepo("scripts/roll_to_next_day.sh"), /health-check\.mjs/, "roll-forward gate runs the health check");
  assert.match(readRepo("scripts/settle_soccer_day.sh"), /health-check\.mjs/, "soccer settlement runs the health check");
  // GitHub Actions
  assert.match(readRepo(".github/workflows/nightly-settle.yml"), /health-check\.mjs/, "nightly settle aborts publish on unhealthy data");
  assert.match(readRepo(".github/workflows/morning-projections.yml"), /health-check\.mjs/, "morning projections aborts publish on unhealthy data");
});
