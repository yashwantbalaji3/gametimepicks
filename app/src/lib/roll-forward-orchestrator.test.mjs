/**
 * Invariant tests for the daily roll-forward orchestrator (scripts/roll_to_next_day.sh).
 * Structural assertions (the script is not executed here — running it would move money / fetch live odds):
 * they pin the SAFETY properties so a future edit can't silently drop a guard. Same approach as
 * soccer-settlement-automation.test.mjs.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const sh = fs.readFileSync(path.join(process.cwd(), "..", "scripts", "roll_to_next_day.sh"), "utf8");

test("settle-first: the prior day is settled BEFORE the next day is generated", () => {
  const settleIdx = sh.indexOf("settle_soccer_day.sh");
  const activateIdx = sh.indexOf("activate-daily-portfolio.mjs");
  const fetchIdx = sh.indexOf("pipeline.world_cup.odds_api");
  assert.ok(settleIdx > 0 && activateIdx > 0 && fetchIdx > 0, "settle, fetch, and activate steps all present");
  assert.ok(settleIdx < fetchIdx && settleIdx < activateIdx, "settlement runs before odds-fetch and activation");
});

test("settle-first HALT guard: refuses to roll while a prior-day Bank Builder lane is still active", () => {
  assert.match(sh, /HALT:.*still ACTIVE\/unsettled/i, "explicit halt message");
  assert.match(sh, /status"\)\s*==\s*"active"/, "guard counts prior-day active BB lanes");
});

test("money-integrity gate guards the roll (pre, post, and pre-deploy)", () => {
  assert.match(sh, /verify-money-integrity\.mjs/, "calls the money-integrity validator");
  // the gate() helper aborts on failure
  assert.match(sh, /gate\(\)\s*\{[\s\S]*?verify-money-integrity[\s\S]*?die/, "gate() aborts the roll on a non-zero validator");
  const calls = (sh.match(/^\s*gate\b/gm) || []).length - 1; // minus the gate() definition line
  assert.ok(calls >= 3, `gate invoked at >=3 hinges (pre / post / pre-deploy), found ${calls}`);
});

test("dry-run by default — writes/deploys only with explicit flags", () => {
  assert.match(sh, /APPLY=0/, "apply defaults off");
  assert.match(sh, /DEPLOY=0/, "deploy defaults off");
  // deploy is doubly-gated: --apply AND --deploy
  assert.match(sh, /\$\{?APPLY\}?"?\s*=\s*1\s*\]\s*&&\s*\[\s*"?\$\{?DEPLOY/, "deploy requires --apply AND --deploy");
});

test("never fabricates — delegates odds to the live feed and results to the settlement engine", () => {
  assert.match(sh, /pipeline\.world_cup\.odds_api/, "odds from the live Odds API");
  assert.match(sh, /settle_soccer_day\.sh/, "results from the official settlement pipeline");
  assert.doesNotMatch(sh, /10176\.17|10376\.17|20065\.4|20465\.4/, "no hardcoded money/results constants");
});

test("composes the full verified chain (all product generators present)", () => {
  for (const s of [
    "verify-money-integrity.mjs", "settle_soccer_day.sh", "build_odds_only_projections",
    "activate-daily-portfolio.mjs", "refresh-world-cup-specials.mjs", "ingest-mlb-slate.mjs",
    "enrich-mlb-headshots.mjs", "capture-market-benchmark.mjs", "npm run build",
  ]) assert.ok(sh.includes(s), `chain includes ${s}`);
});

test("tests + build must pass before deploy (fail-closed)", () => {
  assert.match(sh, /tests failed — not deploying/, "tests gate the deploy");
  assert.match(sh, /build failed — not deploying/, "build gates the deploy");
});
