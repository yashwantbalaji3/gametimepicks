/**
 * Regression: an MLB Void row is shown as Void, never as Push (2026-10-18 integrity audit:
 * all 41 rows of the postponed 2026-10-16 TB@CLE slate rendered "Push" on /results/mlb/).
 *
 * Run: npx tsx --test app/src/lib/mlb-settled-outcome.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { mlbOutcomeToSettledResult, tallyMlbOutcomes } from "./mlb-settled-outcome.ts";
import { summarizePlayerResults } from "./settled-player-summary.ts";
import { getSettledLeanResultIcon, normalizeResult } from "./result-icons.ts";

test("mlbOutcomeToSettledResult maps Void to void, not push", () => {
  assert.equal(mlbOutcomeToSettledResult("Win"), "win");
  assert.equal(mlbOutcomeToSettledResult("Loss"), "loss");
  assert.equal(mlbOutcomeToSettledResult("Push"), "push");
  assert.equal(mlbOutcomeToSettledResult("Void"), "void");
});

test("mlbOutcomeToSettledResult never promotes an unknown outcome to a graded state", () => {
  for (const o of [undefined, null, "", "Pending", "push"]) {
    const r = mlbOutcomeToSettledResult(o);
    assert.ok(!["win", "loss", "push"].includes(r), `${String(o)} → ${r}`);
  }
});

test("tallyMlbOutcomes counts voids apart from pushes, wins and losses", () => {
  const rows = [
    { outcome: "Win" },
    { outcome: "Loss" },
    { outcome: "Push" },
    { outcome: "Void" },
    { outcome: "Void" },
  ];
  assert.deepEqual(tallyMlbOutcomes(rows), { wins: 1, losses: 1, pushes: 1, voids: 2 });
  // The postponed-slate shape: every row void, nothing graded.
  const postponed = Array.from({ length: 41 }, () => ({ outcome: "Void" }));
  assert.deepEqual(tallyMlbOutcomes(postponed), { wins: 0, losses: 0, pushes: 0, voids: 41 });
});

test("a Void row through the player-list path is a void, never a push, win, loss or pending", () => {
  const rows = ["Void", "Void", "Win"].map((outcome, i) => ({
    date: "2026-10-16",
    gameId: "849817",
    playerName: "P1",
    team: "TB",
    side: "Under",
    line: 0.5,
    result: mlbOutcomeToSettledResult(outcome),
    _i: i,
  }));
  const s = summarizePlayerResults(rows);
  assert.equal(s.voids, 2);
  assert.equal(s.pushes, 0);
  assert.equal(s.wins, 1);
  assert.equal(s.losses, 0);
  assert.equal(s.pending, 0);
  assert.equal(s.decisive, 1, "voids are outside the decisive denominator");
  assert.equal(s.hitRate, 1);
});

test("a void settled lean displays the label Void; the shared parlay normalizer is unchanged", () => {
  assert.equal(getSettledLeanResultIcon("void").label, "Void");
  assert.notEqual(getSettledLeanResultIcon("void").label, "Push");
  assert.equal(getSettledLeanResultIcon("push").label, "Push");
  assert.equal(getSettledLeanResultIcon("win").label, "Hit");
  // Parlay slips/legs still read "void" as pending; this fix does not move them.
  assert.equal(normalizeResult("void"), "pending");
});
