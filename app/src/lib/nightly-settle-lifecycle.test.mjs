/**
 * NIGHTLY SETTLE LIFECYCLE GUARD (Sprint 025 — paper-settlement wiring).
 *
 * The paper product-card lifecycle was fully built and tested but never scheduled: `fetch-mlb-linescores`,
 * `build-mlb-product-settlement`, `settle-paper-product-cards` and `build-paper-track-record` all existed,
 * all passed their unit tests, and none of them ran in CI. The internal ledgers simply stopped advancing
 * after 2026-07-09 while every workflow stayed green — the same silent-failure class as the discarded
 * `predictions/` and `full-game-simulations/` artifacts, one layer down.
 *
 * This pins three invariants that, together, make that class of failure loud:
 *
 *   1. WIRED     — each lifecycle stage is actually invoked by the nightly workflow.
 *   2. PERSISTED — each stage's output directory is inside the commit scope, so a run cannot generate
 *                  a ledger and then throw it away.
 *   3. GATED     — automation never authors or commits the FOUNDER-APPROVED inputs
 *                  (product-cards/paper/, product-cards/approvals/) and never runs the promotion script.
 *
 * Plus ordering: settlement must run after the settlement orchestrator (or it grades a stale
 * settled_leans) and before the health gate (or corrupt ledgers reach the push).
 *
 * Run: npx tsx --test src/lib/nightly-settle-lifecycle.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const WORKFLOW = path.join(process.cwd(), "..", ".github", "workflows", "nightly-settle.yml");
const yml = fs.readFileSync(WORKFLOW, "utf8");

/** Every `git add` path this workflow stages (the step uses one line per path, not one combined line). */
const stagedPaths = yml
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l.startsWith("git add "))
  .map((l) => l.replace(/^git add\s+/, "").split(/\s+/)[0]);

/** Which internal ledger directory each lifecycle stage writes. Extend when a stage is added. */
const STAGE_OUTPUT = {
  "fetch-mlb-linescores.mjs": "data/internal/mlb/linescores/",
  "build-mlb-product-settlement.mjs": "data/internal/mlb/product-settlement/",
  "settle-paper-product-cards.mjs": "data/internal/product-cards/settlements/",
  "build-paper-track-record.mjs": "data/internal/product-cards/track-record/",
};

test("every paper-settlement lifecycle stage is actually invoked by the nightly workflow", () => {
  const unwired = Object.keys(STAGE_OUTPUT).filter((s) => !yml.includes(s));
  assert.deepEqual(
    unwired,
    [],
    `built but unscheduled — the ledger silently stops advancing:\n${unwired.join("\n")}`,
  );
});

test("every lifecycle stage's output directory is inside the commit scope", () => {
  const discarded = [];
  for (const [script, dir] of Object.entries(STAGE_OUTPUT)) {
    if (!yml.includes(script)) continue; // absence is the previous test's job
    if (!stagedPaths.some((p) => p === dir)) {
      discarded.push(`${script} writes ${dir} but it is NOT staged — every run regenerates and discards it`);
    }
  }
  assert.deepEqual(discarded, [], discarded.join("\n"));
});

test("automation never stages the founder-approved product-card inputs", () => {
  // Settlement grades cards a human already approved. Staging the approval or paper store would let
  // automation author its own inputs, which is the Bank Builder approval gate in a different costume.
  const forbidden = stagedPaths.filter((p) =>
    /^data\/internal\/product-cards\/(paper|approvals)\//.test(p) ||
    p === "data/internal/product-cards/" ||
    p === "data/internal/product-cards",
  );
  assert.deepEqual(forbidden, [], `automation must never commit founder-gated inputs: ${forbidden.join(", ")}`);
});

test("automation never runs the founder promotion script", () => {
  assert.ok(
    !yml.includes("promote-founder-review-to-paper-card"),
    "promotion into the paper store is a founder decision — automation may settle cards, never create them",
  );
});

test("the commit step never stages the whole tree", () => {
  assert.ok(!/git add\s+(-A|\.|--all)\b/.test(yml), "money paths must be unreachable from automation's commit scope");
});

test("settlement runs after the orchestrator and before the health gate", () => {
  const at = (needle) => yml.indexOf(needle);
  const orchestrator = at("automation_settle.sh");
  const settlement = at("settle-paper-product-cards.mjs");
  const healthGate = at("health-check.mjs");
  const push = at("git push");

  assert.ok(orchestrator >= 0 && settlement >= 0 && healthGate >= 0 && push >= 0, "all four anchors present");
  assert.ok(
    orchestrator < settlement,
    "grading must precede paper settlement — otherwise it settles against a stale settled_leans.jsonl",
  );
  assert.ok(healthGate < push, "the health gate must still guard the push");
  assert.ok(
    settlement < healthGate,
    "paper settlement must run before the health gate so a corrupt ledger cannot be pushed",
  );
});
