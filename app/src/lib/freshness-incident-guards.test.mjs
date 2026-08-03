/**
 * Regression proofs for the 2026-08-01→03 staleness incident (Program 100-103).
 *
 * THE INCIDENT
 * The public site froze on the 2026-07-31 slate for three days. Two layers combined:
 *   (1) LATENT: `app/public/data/research/` was missing from nightly-settle's commit allowlist,
 *       so the public research contract — rebuilt from the ledger on every settle — was never
 *       committed. It could only ever be corrected by a hand-made commit, and silently drifted.
 *   (2) BLAST RADIUS: the `research-contract:stale` gate (Program 092-095) was evaluated inside
 *       morning-projections, the board GENERATOR. The latent drift therefore aborted generation
 *       itself: no Aug 1 board → nightly-settle could not settle Aug 1 ("board file not found")
 *       → no Aug 2 board → three stale days.
 *
 * These assertions make either layer's return a test failure.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

test("LAYER 1 · nightly-settle commits the research contract it rebuilds", () => {
  const yml = read(".github/workflows/nightly-settle.yml");
  assert.match(
    yml,
    /build-public-research-contract\.mjs --write/,
    "the settle must still rebuild the contract from the settled ledger",
  );
  assert.match(
    yml,
    /git add app\/public\/data\/research\//,
    "…and MUST commit it: an artifact that is written but never committed can only drift, and " +
      "that drift is what froze the product for three days",
  );
});

test("LAYER 2 · the board generator is not gated on downstream contract staleness", () => {
  const yml = read(".github/workflows/morning-projections.yml");
  assert.match(yml, /health-check\.mjs/, "generation still runs the health gate");
  assert.match(
    yml,
    /health-check\.mjs[^\n]*--phase generate/,
    "…but in GENERATE phase: money/reconciliation/hygiene still abort, a stale public contract " +
      "does not. Today's board is what fixes the day; it must never be blocked by a downstream artifact",
  );
});

test("LAYER 2 · publish callers keep the strict default (no accidental weakening)", () => {
  // The fix must not have quietly downgraded the gate everywhere. Publish paths pass no --phase,
  // so they get `publish` and the check stays CRITICAL.
  const settle = read(".github/workflows/nightly-settle.yml");
  const settleGate = settle.split("\n").find((l) => l.includes("health-check.mjs")) ?? "";
  assert.ok(settleGate.length > 0, "nightly-settle must still run the health gate");
  assert.doesNotMatch(settleGate, /--phase generate/, "the publish gate must stay strict");

  const roll = read("scripts/roll_to_next_day.sh");
  assert.match(roll, /health-check\.mjs/, "the roll's publish gate must still run");
  assert.doesNotMatch(
    roll.split("\n").find((l) => l.includes("health-check.mjs")) ?? "",
    /--phase generate/,
    "the roll publishes — it must keep the strict gate",
  );
});

test("the health gate implements phase scoping with publish as the default", () => {
  const gate = read("app/scripts/health-check.mjs");
  assert.match(gate, /--phase/, "phase flag must exist");
  assert.match(gate, /\?\s*String\(argv\[i \+ 1\]\)\s*:\s*"publish"/, "default phase must be publish");
  assert.match(
    gate,
    /GENERATE_PHASE\s*\?\s*W\s*:\s*C/,
    "contract staleness must be a WARNING in generate phase and CRITICAL otherwise",
  );
});

test("board generation cannot silently stop producing a board for the current ET day", () => {
  // The observer is the thing that must notice next time before a human does.
  const obs = read("app/scripts/public-beta-observe.mjs");
  assert.match(obs, /STALE_BOARD_DAYS/, "the observer must carry a board-staleness threshold");
});
