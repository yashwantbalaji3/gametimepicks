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
import { makeSettledApprovedRoot } from "./__testsupport__/settled-ladder-root.mjs";
import { pinnedLaneRoot } from "./bank-builder/fixtures/root.mjs";

const root = pinnedLaneRoot();
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
const REC = (w, l, v = 0) => ({ wins: w, losses: l, voids: v, pending: 0 });

// ---- TRANSITION CLASSIFIER ----
// P192 · PINNED LANE STATE. This regression is about a specific historical lane state, so it reads a
// pinned snapshot instead of the live ladder. Reading `public/data` directly made the running
// product double as a fixture: Bank Builder and Moonshot could not advance to a live card without
// breaking assertions that require July's state to still be on disk. The assertions are unchanged —
// only where their data comes from is.
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
  assert.deepEqual(p.record, REC(19, 14), "canonical record 19-14 (dual-lane settlements through July-7; Lane A won Steps 1 & 2 in cycle 6 then lost July-3, both lanes lost July-5, then Lane A won its cycle-8 Step-1 July-6 and Step-2 July-7)");
  // wins beyond the 5-0 crown ladder are dual-lane step wins; the CURRENT run's settled rungs are a subset of that
  // history. JULY-21 REVIEW RESTART: both lanes were reset to fresh Step-1 review cycles (paper, $0), so the TOP
  // LEVEL of the live run carries ZERO settled-WON rungs. The advanced July-6/July-7 cycle (8: Lane A Step-1 +
  // Step-2 WON) moved one level down into Lane A's priorLane; the July-5 losses (cycle 7) and the July-1/July-2
  // settled-won Steps (cycle 6) sit deeper. The record subset invariant still holds: dual-lane wins ≥ live settled-won.
  const dualPortion = p.record.wins - 5;
  assert.ok(dualPortion >= activeDualWon, `dual-lane wins (${dualPortion}) ≥ current run's settled-won rungs (${activeDualWon})`);
  assert.ok(activeDualWon === 0, "live run: both lanes restarted to fresh Step-1 review (paper, $0) — no settled-WON rungs at the top level");
  // Lane A's priorLane is the advanced July-6/July-7 cycle 8 (Step-1 + Step-2 WON, 2 wins); the July-1 + July-2
  // settled-won rungs are two levels deeper still (cycle 6).
  const priorAWon = (run.laneA.priorLane?.steps ?? []).filter((s) => s.status === "settled" && s.result === "won").length;
  assert.equal(priorAWon, 2, "Lane A priorLane (cycle 8) preserves the July-6 Step-1 + July-7 Step-2 WON rungs");
  const deeperAWon = (run.laneA.priorLane?.priorLane?.priorLane?.steps ?? []).filter((s) => s.status === "settled" && s.result === "won").length;
  assert.equal(deeperAWon, 2, "the July-1 + July-2 settled-won rungs are preserved three levels deeper (Lane A cycle 6)");
});

test("post-banking + July-21 review restart: the advanced cycle-8 (Steps 1 & 2 WON) is preserved in priorLane; the live top is a fresh Step-1 review; completion rule unchanged", () => {
  // POST-BANKING: the operator BANKED Lane A's completed $100→$10k ladder (final $10,089.23 → Ladder #2). The
  // advanced July-6/July-7 cycle-8 (Step-1 + Step-2 WON, forward rung Step 3, rolled $305.57) is validated against a
  // reconstructed settled root — the July-21 REVIEW RESTART moved that cycle into priorLane. The live top level is
  // now a fresh Step-1 review (paper, $0) for both lanes. The COMPLETION transition rule itself is unchanged.
  const { tmp, dataRoot } = makeSettledApprovedRoot(root);
  try {
    const { laneA, laneB } = readLaneRungs(dataRoot);
    assert.ok(laneA, "Lane A has a forward rung (cycle-8 advanced to Step 3)");
    assert.equal(laneA.nextStep, 3, "Lane A forward rung is Step 3 (Steps 1 & 2 WON, advanced)");
    assert.equal(laneA.clearedSteps, 2, "Lane A advanced cycle has 2 cleared steps (the WON Step-1 + Step-2)");
    assert.equal(laneA.rolledStake, 305.57, "Lane A forward rung stakes the rolled WON Step-2 payout ($305.57)");
    assert.ok(!laneB, "Lane B has NO forward rung — deliberate no-play (stays stopped, never restarted)");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  // The completion transition: clearing the final rung (the 5th, index STEP_COUNT-1) is a COMPLETE, not a roll.
  assert.equal(classifyLaneTransition(BANK_BUILDER_STEP_COUNT - 1, "won"), "complete", "clearing the final rung is a COMPLETION");
  const run = read("methodology/launch/dual-bank-builder-active.json").run;
  // JULY-21 REVIEW: live top-level is the fresh Step-1 review; the advanced cycle-8 WON history moved to priorLane.
  assert.equal(run.laneA.laneStatus, "active", "live Lane A restarted to a fresh Step-1 review (cycle 9)");
  assert.equal(run.laneA.currentStep, 1, "live Lane A restarted to Step 1");
  assert.equal(run.laneA.priorLane.laneStatus, "advanced", "the advanced cycle-8 (July-6 Step-1 + July-7 Step-2 WON) is preserved in priorLane");
  assert.equal(run.laneA.priorLane.steps[0].result, "won", "cycle-8 Step-1 settled WON (July-6)");
  assert.equal(run.laneA.priorLane.steps[1].result, "won", "cycle-8 Step-2 settled WON (July-7)");
  assert.equal(run.laneB.laneStatus, "active", "live Lane B restarted to a fresh Step-1 review (cycle 8)");
  // The stopped July-5 cycle (7) is preserved two levels deeper (priorLane chain) — never erased.
  assert.equal(run.laneA.priorLane.priorLane.laneStatus, "stopped", "Lane A cycle 7 (LOST July-5 Step-1) preserved two levels down");
  assert.equal(run.laneB.priorLane.laneStatus, "stopped", "Lane B priorLane preserves the stopped cycle 7 (LOST July-5 Step-1)");
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
  assert.deepEqual(p.record, { wins: 19, losses: 14, voids: 0, pending: 0 });
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
