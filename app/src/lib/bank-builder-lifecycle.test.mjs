/**
 * Bank Builder lane LIFECYCLE contract — the full set of state transitions that must hold for the ladder
 * to run autonomously day after day. Synthetic fixtures exercise the RULES; the live-artifact tests assert
 * the real ladder is in a consistent post-June-23 state. Money invariant: a won non-final step ROLLS
 * (bankroll unchanged); only a lost step drops the $100 seed; a FINAL-rung win COMPLETES (banking is an
 * explicit operator-gated step, never a silent roll).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { classifyLaneTransition, seedModelOutcome } from "./settlement/daily-portfolio-settle.ts";
import { readLaneRungs } from "./daily-portfolio/bank-builder-generation.ts";
import { BANK_BUILDER_STEP_COUNT } from "./bank-builder-ladder.ts";

const root = path.join(process.cwd(), "public", "data");
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
const REC = (w, l, v = 0) => ({ wins: w, losses: l, voids: v, pending: 0 });

// ---- TRANSITION CLASSIFIER ----
test("transition: rung advancement (won, non-final) → advance", () => {
  for (let cleared = 0; cleared < BANK_BUILDER_STEP_COUNT - 1; cleared++) {
    assert.equal(classifyLaneTransition(cleared, "won"), "advance", `cleared ${cleared} + won → advance`);
  }
});

test("transition: lane completion (won, final rung) → complete", () => {
  assert.equal(classifyLaneTransition(BANK_BUILDER_STEP_COUNT - 1, "won"), "complete", "clearing the 5th rung completes the ladder");
});

test("transition: lane failure (lost) → stop, at any rung", () => {
  for (let cleared = 0; cleared < BANK_BUILDER_STEP_COUNT; cleared++) {
    assert.equal(classifyLaneTransition(cleared, "lost"), "stop");
  }
});

test("transition: lane void/push → hold (seed returned, no rung change)", () => {
  assert.equal(classifyLaneTransition(2, "void"), "hold");
  assert.equal(classifyLaneTransition(2, "push"), "hold");
  assert.equal(classifyLaneTransition(2, "pending"), "hold");
});

// ---- MONEY OUTCOME PER TRANSITION ----
test("won step rolls: bankroll + crown unchanged, record +1 (the seed model)", () => {
  const out = seedModelOutcome({ record: REC(12, 2), bankroll: 10176.17 }, [{ status: "won" }]);
  assert.deepEqual(out.record, REC(13, 2));
  assert.equal(out.bankroll, 10176.17, "won steps never move the bankroll");
});

test("lost step stops: bankroll −$100 seed, record +1 loss", () => {
  const out = seedModelOutcome({ record: REC(12, 2), bankroll: 10176.17 }, [{ status: "lost" }]);
  assert.deepEqual(out.record, REC(12, 3));
  assert.equal(out.bankroll, 10076.17);
});

test("void step holds: bankroll unchanged, voids +1", () => {
  const out = seedModelOutcome({ record: REC(12, 2), bankroll: 10176.17 }, [{ status: "void" }]);
  assert.deepEqual(out.record, REC(12, 2, 1));
  assert.equal(out.bankroll, 10176.17);
});

// ---- MULTI-DAY CONTINUATION (sequential settlements compound the record, never the bankroll) ----
test("multi-day continuation: 3 consecutive won days advance the record by 3, bankroll frozen", () => {
  let state = { record: REC(12, 2), bankroll: 10176.17 };
  for (let day = 0; day < 3; day++) {
    const out = seedModelOutcome(state, [{ status: "won" }]);
    state = { record: out.record, bankroll: out.bankroll };
  }
  assert.deepEqual(state.record, REC(15, 2), "three won days → +3 wins");
  assert.equal(state.bankroll, 10176.17, "bankroll never moved across the multi-day run");
});

test("multi-day continuation: a lost day mid-run drops exactly one $100 seed", () => {
  let state = { record: REC(12, 2), bankroll: 10176.17 };
  for (const r of ["won", "won", "lost", "won"]) {
    const out = seedModelOutcome(state, [{ status: r }]);
    state = { record: out.record, bankroll: out.bankroll };
  }
  assert.deepEqual(state.record, REC(15, 3));
  assert.equal(state.bankroll, 10076.17, "only the one lost seed moved the bankroll");
});

// ---- DUPLICATE SETTLEMENT PROTECTION ----
test("duplicate settlement protection: seedModelOutcome is a pure function of (before, plans) — re-applying the SAME settled plans to the ALREADY-advanced state double-counts, so the apply path must guard idempotency at the ladder (settled steps are skipped)", () => {
  // The lib is intentionally pure; idempotency is enforced where state lives (the ladder). This test
  // documents the contract and the live-artifact test below proves the ladder has no duplicate steps.
  const first = seedModelOutcome({ record: REC(10, 2), bankroll: 10176.17 }, [{ status: "won" }, { status: "won" }]);
  assert.deepEqual(first.record, REC(12, 2));
  // Re-running against the result would WRONGLY yield 14-2 — which is exactly why the script skips steps
  // already status==="settled" (see settle-daily-portfolio.mjs). Proven by the live ladder test below.
  const wrong = seedModelOutcome({ record: first.record, bankroll: first.bankroll }, [{ status: "won" }, { status: "won" }]);
  assert.deepEqual(wrong.record, REC(14, 2), "re-applying double-counts → the ladder-level skip guard is what prevents this");
});

// ---- LIVE-ARTIFACT STATE (post June-23): the ladder is internally consistent + autonomous-ready ----
test("live ladder: each lane has at most one settled step per rung (no duplicate settlement)", () => {
  const run = read("methodology/launch/dual-bank-builder-active.json").run;
  for (const key of ["laneA", "laneB"]) {
    const steps = run[key].steps ?? [];
    const stepNos = steps.map((s) => s.step);
    assert.equal(new Set(stepNos).size, stepNos.length, `${key} has no duplicate step entries`);
    const settledWon = steps.filter((s) => s.status === "settled" && s.result === "won");
    for (const s of settledWon) assert.ok((s.legs ?? []).length >= 1 && s.payout > 0, `${key} Step ${s.step} settled-won carries real legs + payout`);
  }
});

test("live ladder: record is consistent with the crown ladder + dual-lane settled rungs (current run is a subset of dual-lane history)", () => {
  const p = read("mr-dub/portfolio.json");
  const run = read("methodology/launch/dual-bank-builder-active.json").run;
  const activeDualWon = ["laneA", "laneB"].reduce((n, k) => n + (run[k].steps ?? []).filter((s) => s.status === "settled" && s.result === "won").length, 0);
  assert.deepEqual(p.record, REC(12, 2), "canonical record 12-2");
  // wins beyond the 5-0 crown ladder are dual-lane step wins; the CURRENT active run's settled rungs are a
  // subset (Lane B restarted after a prior lost run, so some dual-lane wins predate this artifact).
  const dualPortion = p.record.wins - 5;
  assert.ok(dualPortion >= activeDualWon, `dual-lane wins (${dualPortion}) ≥ current active-run settled rungs (${activeDualWon})`);
  assert.ok(activeDualWon === 6, "current active run shows 6 settled-won rungs (Lane A 1-4 + Lane B 1-2)");
});

test("live ladder: Lane A sits on the FINAL rung — its next win COMPLETES (operator-gated banking, not a silent roll)", () => {
  const { laneA, laneB } = readLaneRungs(root);
  assert.ok(laneA, "Lane A rung resolves");
  assert.equal(laneA.nextStep, BANK_BUILDER_STEP_COUNT, "Lane A next rung is the final rung (Step 5)");
  assert.equal(classifyLaneTransition(laneA.clearedSteps, "won"), "complete", "a Lane A Step 5 win is a COMPLETION");
  assert.equal(classifyLaneTransition(laneB.clearedSteps, "won"), "advance", "Lane B (Step 3) still advances");
});

test("active-run protection: settled rungs are immutable history — exposure only ever sits on a lane's NEXT (unsettled) rung, never on a settled one", () => {
  const p = read("mr-dub/portfolio.json");
  // The CANONICAL dual-ladder never carries exposure on a settled rung (settled steps released their seeds).
  assert.equal(p.openExposure, 0, "no canonical exposure carried from settled rungs");
  assert.deepEqual(p.record, { wins: 12, losses: 2, voids: 0, pending: 0 });
  // The daily portfolio MAY place a new card on the lane's current (unsettled) rung — legitimate forward
  // exposure. Verify no active BB lane card sits on an already-settled rung.
  const dp = read("mr-dub/daily-portfolio.json");
  const run = read("methodology/launch/dual-bank-builder-active.json").run;
  for (const l of (dp.lanes ?? []).filter((x) => x.product === "bank-builder" && x.status === "active")) {
    const laneKey = l.lane === "A" ? "laneA" : "laneB";
    const settled = new Set((run[laneKey].steps ?? []).filter((s) => s.status === "settled").map((s) => s.step));
    assert.ok(!settled.has(l.step), `active BB Lane ${l.lane} card is on rung ${l.step}, which is NOT a settled rung`);
  }
});
