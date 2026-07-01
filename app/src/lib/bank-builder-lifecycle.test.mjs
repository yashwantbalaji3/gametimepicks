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
  assert.deepEqual(p.record, REC(15, 9), "canonical record 15-9 (June-25/26/27/29 dual-lane settlements; both lanes settled-LOST their June-29 Step)");
  // wins beyond the 5-0 crown ladder are dual-lane step wins; the CURRENT run's settled rungs are a subset of
  // that history. POST-BANKING + JUNE-29 SETTLEMENT: the prior dual run banked (Lane A → Ladder #2), then both
  // lanes settled-LOST their June-29 Step — the live artifact's top-level steps now hold ZERO settled-won rungs
  // (the prior wins are archived in each lane's priorLane chain). The record subset invariant still holds:
  // dual-lane wins ≥ the live run's settled-won rungs.
  const dualPortion = p.record.wins - 5;
  assert.ok(dualPortion >= activeDualWon, `dual-lane wins (${dualPortion}) ≥ current run's settled-won rungs (${activeDualWon})`);
  assert.ok(activeDualWon === 0, "live run's two lanes settled-LOST their June-29 Step — no settled-won rungs at the top level (wins archived in priorLanes)");
});

test("post-banking: Lane A's completed final rung was operator-gated BANKED (Ladder #2); both lanes then settled-LOST their June-29 Step", () => {
  // POST-BANKING + JUNE-29 SETTLEMENT: the operator BANKED Lane A's completed $100→$10k ladder (final $10,089.23 →
  // Ladder #2) and started a fresh dual cycle. After the subsequent settlements, both lanes settled-LOST their
  // June-29 Step (Lane A cycle 5, Lane B cycle 4) and are now stopped with no open forward rung. The COMPLETION
  // transition rule itself is unchanged.
  const { laneA, laneB } = readLaneRungs(root);
  assert.equal(laneA, null, "Lane A has no live forward rung (Step-1 settled-LOST June-29)");
  assert.equal(laneB, null, "Lane B has no live forward rung (Step-1 settled-LOST June-29)");
  // The completion transition: clearing the final rung (the 5th, index STEP_COUNT-1) is a COMPLETE, not a roll.
  assert.equal(classifyLaneTransition(BANK_BUILDER_STEP_COUNT - 1, "won"), "complete", "clearing the final rung is a COMPLETION");
  const run = read("methodology/launch/dual-bank-builder-active.json").run;
  assert.equal(run.laneA.laneStatus, "stopped", "live Lane A stopped — Step-1 settled-LOST June-29");
  assert.equal(run.laneA.currentStep, 1, "live Lane A is on Step 1");
  assert.equal(run.laneB.laneStatus, "stopped", "live Lane B stopped — Step-1 settled-LOST June-29");
  // The completed Lane A ladder now lives in the BANKED archive (not the live artifact, not a pending flag).
  const banked = read("mr-dub/banked-ladders.json");
  const ladder2 = (banked.ladders ?? []).find((b) => b.ladder === 2);
  assert.ok(ladder2, "Lane A's completed ladder is banked as Ladder #2");
  assert.equal(ladder2.final, 10089.23, "banked Ladder #2 carries the $10,089.23 official final");
  assert.equal(ladder2.official, true, "banked from an official settlement");
  // Operator-gated banking COMPLETED: the pending flag is gone and crown = Σ both banked-ladder finals.
  const p = read("mr-dub/portfolio.json");
  assert.ok(!(p.pendingLaneCompletions ?? []).some((c) => c.lane === "A"), "Lane A completion is no longer PENDING — it was banked");
  assert.equal(p.crownBankroll, 20465.4, "crown = Σ two completed-ladder finals (10,376.17 + 10,089.23), not a silent roll");
  assert.equal(banked.crownTotal, 20465.4, "banked archive crownTotal reconciles with the portfolio crown");
  // Lane B (a fresh Step-1 with 0 cleared) would still ADVANCE on a non-final win — the rule is intact.
  assert.equal(classifyLaneTransition(0, "won"), "advance", "a non-final cleared count still advances on a win");
});

test("active-run protection: settled rungs are immutable history — exposure only ever sits on a lane's NEXT (unsettled) rung, never on a settled one", () => {
  const p = read("mr-dub/portfolio.json");
  // The CANONICAL dual-ladder never carries exposure on a settled rung (settled steps released their seeds).
  assert.equal(p.openExposure, 0, "no canonical exposure carried from settled rungs");
  assert.deepEqual(p.record, { wins: 15, losses: 9, voids: 0, pending: 0 });
  // The daily portfolio MAY place a new card on the lane's current (unsettled) rung — legitimate forward
  // exposure. Verify no active BB lane card carries STALE exposure on a rung that was settled on an EARLIER
  // slate. A same-day card on a rung the live ladder just settled is fine: it IS that day's card, now graded
  // (e.g. the June-25 snapshot's Step-1 cards became the live ladder's settled Step-1 rungs).
  const dp = read("mr-dub/daily-portfolio.json");
  const run = read("methodology/launch/dual-bank-builder-active.json").run;
  for (const l of (dp.lanes ?? []).filter((x) => x.product === "bank-builder" && x.status === "active" && !x.approvedAt)) {
    // An operator-APPROVED fresh-restart lane (x.approvedAt set) is a NEW cycle's Step 1 — it legitimately
    // starts a fresh ladder even though the terminal ladder already settled its own Step 1, so it is not a
    // re-occupation of prior-slate history and is excluded from this check. Auto-generated lanes still must
    // never sit on a prior-slate settled rung.
    const laneKey = l.lane === "A" ? "laneA" : "laneB";
    // A settled rung from a PRIOR slate is immutable history; an active card must never re-occupy it.
    const staleSettled = new Set(
      (run[laneKey].steps ?? [])
        .filter((s) => s.status === "settled" && s.slateDate && s.slateDate !== dp.date)
        .map((s) => s.step),
    );
    assert.ok(!staleSettled.has(l.step), `active BB Lane ${l.lane} card is on rung ${l.step}, which is NOT a prior-slate settled rung`);
  }
});
