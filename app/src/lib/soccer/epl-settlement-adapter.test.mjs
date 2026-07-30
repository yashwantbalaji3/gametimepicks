/**
 * EPL settlement adapter — blocked today, and correct for the day it is not.
 *
 * The synthetic-source override is how the grading path is exercised without pretending a results
 * source exists. The default staying empty is asserted separately, so the blocked state cannot be
 * lifted by an accidental edit.
 *
 * Run: npx tsx --test src/lib/soccer/epl-settlement-adapter.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  EPL_APPROVED_RESULTS_SOURCES,
  eplSettlementReadiness,
  settleEplFixture,
} from "./epl-settlement-adapter.ts";

const EVENT = "soccer:epl:arsenal-v-chelsea:20260822t1400";
const KICKOFF = "2026-08-22T14:00:00Z";
/** Synthetic only. Present on the platform allowlist so lineage validation has a trusted source. */
const SYNTHETIC = ["operator-official-input"];

const result = (over = {}) => ({
  eventId: EVENT,
  match: "Arsenal vs Chelsea",
  homeGoals: 2,
  awayGoals: 1,
  lifecycle: "FINAL_FT",
  source: "operator-official-input",
  settledAt: "2026-08-22T16:00:00Z",
  kickoffIso: KICKOFF,
  ...over,
});

const leg = (over = {}) => ({
  id: "leg-1",
  matchId: EVENT,
  market: "moneyline_90",
  selection: "Arsenal",
  side: "home",
  oddsAmerican: -125,
  ...over,
});

const lineage = (over = {}) => ({
  predictionId: "leg-1",
  eventId: EVENT,
  marketId: "MATCH_RESULT_1X2",
  outcome: "HOME",
  settlementSource: "operator-official-input",
  settledAt: "2026-08-22T16:00:00Z",
  eventStart: KICKOFF,
  gradedAgainstId: EVENT,
  ...over,
});

// ── the standing state ─────────────────────────────────────────────────────────

test("no results source is approved, so settlement is BLOCKED by default", () => {
  assert.deepEqual([...EPL_APPROVED_RESULTS_SOURCES], [], "the approved list must stay empty");

  const readiness = eplSettlementReadiness();
  assert.equal(readiness.state, "BLOCKED");
  assert.equal(readiness.blocker, "RESULTS_SOURCE_PENDING");

  const out = settleEplFixture({ result: result(), legs: [leg()], lineage: [lineage()] });
  assert.equal(out.readiness.blocker, "RESULTS_SOURCE_PENDING");
  assert.deepEqual(out.graded, [], "a blocked run grades nothing — never a partial grade");
});

test("a source not on the EPL approved list does not grade, even when the list is non-empty", () => {
  const out = settleEplFixture(
    { result: result({ source: "espn-official-scores" }), legs: [leg()], lineage: [lineage()] },
    SYNTHETIC,
  );
  assert.equal(out.readiness.state, "BLOCKED");
  assert.equal(out.readiness.blocker, "SOURCE_NOT_APPROVED");
  assert.deepEqual(out.graded, []);
});

// ── lifecycle gating ───────────────────────────────────────────────────────────

test("POSTPONED and ABANDONED void every market rather than pending forever", () => {
  for (const lifecycle of ["POSTPONED", "ABANDONED"]) {
    const out = settleEplFixture(
      { result: result({ lifecycle }), legs: [leg(), leg({ id: "leg-2" })], lineage: [lineage()] },
      SYNTHETIC,
    );
    assert.equal(out.readiness.blocker, "LIFECYCLE_NOT_GRADEABLE", lifecycle);
    assert.equal(out.voided.length, 2, `${lifecycle} voids every leg`);
    assert.deepEqual(out.graded, []);
    assert.equal(out.lifecycle.state, lifecycle);
  }
});

test("SCHEDULED, REPLAYED and an unrecognised state grade nothing and void nothing", () => {
  for (const lifecycle of ["SCHEDULED", "REPLAYED", "UNKNOWN"]) {
    const out = settleEplFixture({ result: result({ lifecycle }), legs: [leg()], lineage: [lineage()] }, SYNTHETIC);
    assert.equal(out.readiness.blocker, "LIFECYCLE_NOT_GRADEABLE", lifecycle);
    assert.deepEqual(out.graded, []);
    assert.deepEqual(out.voided, [], lifecycle);
  }
});

// ── lineage gating ─────────────────────────────────────────────────────────────

test("a broken lineage chain blocks grading entirely", () => {
  const out = settleEplFixture(
    { result: result(), legs: [leg()], lineage: [lineage({ settlementSource: "a forum post" })] },
    SYNTHETIC,
  );
  assert.equal(out.readiness.blocker, "LINEAGE_VIOLATION");
  assert.equal(out.lineageViolations.some((v) => v.code === "UNTRUSTED_SOURCE"), true);
  assert.deepEqual(out.graded, []);
});

test("two events graded against the same source is the collision that blocks a run", () => {
  const other = "soccer:epl:arsenal-v-chelsea:20270116t1500";
  const out = settleEplFixture(
    {
      result: result(),
      legs: [leg(), leg({ id: "leg-2" })],
      lineage: [lineage(), lineage({ predictionId: "leg-2", eventId: other })],
    },
    SYNTHETIC,
  );
  assert.equal(out.readiness.blocker, "LINEAGE_VIOLATION");
  assert.equal(out.lineageViolations.some((v) => v.code === "WRONG_EVENT_MAPPING"), true);
});

test("a leg pointing at another fixture never reaches the engine", () => {
  const out = settleEplFixture(
    { result: result(), legs: [leg({ matchId: "soccer:epl:everton-v-fulham:20260822t1400" })], lineage: [lineage()] },
    SYNTHETIC,
  );
  assert.equal(out.readiness.blocker, "LEG_EVENT_MISMATCH");
  assert.deepEqual(out.graded, []);
});

// ── the grading path, on synthetic fixtures only ───────────────────────────────

test("with an approved source and a clean chain, grading runs through the canonical engine", () => {
  const out = settleEplFixture(
    {
      result: result(),
      legs: [
        leg(),
        leg({ id: "leg-2", market: "moneyline_90", selection: "Chelsea", side: "away" }),
        leg({ id: "leg-3", market: "match_total_goals", selection: "Over 2.5", side: "over", point: 2.5 }),
        leg({ id: "leg-4", market: "btts", selection: "Both teams to score: Yes", side: "yes" }),
      ],
      lineage: ["leg-1", "leg-2", "leg-3", "leg-4"].map((id) => lineage({ predictionId: id })),
    },
    SYNTHETIC,
  );

  assert.equal(out.readiness.state, "READY");
  assert.equal(out.lifecycle.disposition, "GRADE");
  assert.deepEqual(
    out.graded.map((g) => [g.leg.id, g.result]),
    [
      ["leg-1", "won"],
      ["leg-2", "lost"],
      ["leg-3", "won"],
      ["leg-4", "won"],
    ],
    "2-1 Arsenal: home wins, over 2.5 hits, both teams scored",
  );
  for (const g of out.graded) assert.ok(g.reason.includes("Arsenal vs Chelsea"), g.reason);
});

test("a 0-0 grades the draw side of every team market correctly", () => {
  const out = settleEplFixture(
    {
      result: result({ homeGoals: 0, awayGoals: 0 }),
      legs: [
        leg({ id: "leg-1", market: "draw_no_bet", selection: "Arsenal draw no bet" }),
        leg({ id: "leg-2", market: "btts", selection: "Both teams to score: No", side: "no" }),
        leg({ id: "leg-3", market: "match_total_goals", selection: "Under 2.5", side: "under", point: 2.5 }),
      ],
      lineage: ["leg-1", "leg-2", "leg-3"].map((id) => lineage({ predictionId: id })),
    },
    SYNTHETIC,
  );
  assert.deepEqual(
    out.graded.map((g) => [g.leg.id, g.result]),
    [
      ["leg-1", "void"],
      ["leg-2", "won"],
      ["leg-3", "won"],
    ],
  );
});

test("the adapter returns grades and nothing else — no ledger, no money field", () => {
  const out = settleEplFixture({ result: result(), legs: [leg()], lineage: [lineage()] }, SYNTHETIC);
  assert.deepEqual(
    Object.keys(out).sort(),
    ["eventId", "graded", "lifecycle", "lineageViolations", "readiness", "voided"],
    "an outcome carries no stake, payout, bankroll or P/L field",
  );
});
