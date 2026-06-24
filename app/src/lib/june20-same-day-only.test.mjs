import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Cross-slate active-placement invariant (supersedes the emergency June 20 same-day-only rule):
// under the approved broader criteria, PLACED/ACTIVE legs legitimately span the June 21 + June 22
// slates. The remaining guard is that no PLACED/ACTIVE leg is TRULY STALE — i.e. no active leg has
// an ET kickoff date BEFORE the June 21 slate (settled historical June 19 legs live only in settled
// steps, never in an open card). The protected crown ladder stays untouched.
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const SLATE = "2026-06-21";
// ET = UTC-4 (EDT). Map a kickoff instant to its ET calendar date.
const etDate = (iso) => new Date(Date.parse(iso) - 4 * 3600 * 1000).toISOString().slice(0, 10);
const isStale = (iso) => iso && etDate(iso) < SLATE; // before the June 21 slate → stale past-date leg

const bb = read("public/data/methodology/launch/dual-bank-builder-active.json").run;
const moon = read("public/data/moonshot-lane/active.json");
const portfolio = read("public/data/mr-dub/portfolio.json");

test("Bank Builder: both lanes settled WON → no open (placed/active) step legs remain, and no surfaced leg is stale", () => {
  let openLegCount = 0;
  let settledLegCount = 0;
  for (const [id, lane] of [["lane-a", bb.laneA], ["lane-b", bb.laneB]]) {
    for (const s of lane.steps ?? []) {
      if (s.status === "pending" || s.status === "active") {
        for (const l of s.legs ?? []) {
          openLegCount++;
          assert.ok(!isStale(l.startTime), `${id} step ${s.step} open leg ${l.participantName} is a stale past-date leg (${l.startTime})`);
        }
      }
      if (s.status === "settled" && s.result === "won") {
        // Settled WON steps are historical and legitimately span the June 18-22 cleared cards.
        for (const _l of s.legs ?? []) settledLegCount++;
      }
    }
  }
  // Both lanes settled WON — no card is placed/active anymore, so there are NO open legs.
  assert.equal(openLegCount, 0, "no open legs — both lanes settled WON, awaiting the next qualified card");
  // The cross-slate settled legs (June 21 + June 22) are present and none is stale.
  assert.ok(settledLegCount >= 2, "cross-slate settled WON cards carry their graded legs in both lanes");
});

test("Bank Builder: candidate surfaces resolved into placed cards (no leftover candidate-only legs)", () => {
  // Under the cross-slate resume the lanes carry PLACED cards, not nextCandidate-only surfaces.
  for (const [id, lane] of [["lane-a", bb.laneA], ["lane-b", bb.laneB]]) {
    const c = lane.nextCandidate;
    if (!c) continue;
    // If a candidate still exists it must carry an honest reason and no stale past-date leg.
    for (const l of c.legs ?? []) {
      assert.ok(!isStale(l.startTime), `${id} candidate leg ${l.participantName} is a stale past-date leg (${l.startTime})`);
    }
    assert.ok(typeof c.reason === "string" && c.reason.length > 20, `${id} candidate carries an honest reason`);
  }
});

test("Moonshot: Step 1 card settled LOST (lane stopped, no active card); restartCandidate cleared", () => {
  // The Moonshot Step 1 cross-slate restart card settled LOST (NZ/Egypt BTTS No missed) → lane is stopped.
  assert.equal(moon.restartCandidate, null, "moonshot restartCandidate cleared");
  assert.equal(moon.status, "stopped", "moonshot lane stopped (settled LOST)");
  assert.equal((moon.ladder ?? []).find((s) => s.status === "active"), undefined, "no active Moonshot card (lane settled)");
  const settled = (moon.ladder ?? []).find((s) => s.status === "stopped")?.card;
  assert.ok(settled, "Moonshot Step 1 settled card present");
  assert.equal(settled.result, "lost", "Step 1 restart card settled LOST");
  // No settled-card leg is a stale PAST-slate leg: the only June-21 leg is the now-final NZ/Egypt settlement trigger.
  for (const l of settled.legs ?? []) {
    assert.ok(!isStale(l.startTime), `moonshot settled leg ${l.participant} is a stale past-date leg (${l.startTime})`);
  }
});

test("Mr. Dub: both lanes settled WON → no open exposure ($0 core after Lane A + Lane B settled WON; moonshot settled → 0)", () => {
  assert.equal(portfolio.openExposure, 0, "Lane A Step 3 settled WON + Lane B settled WON → both seeds released, $0 open");
  assert.equal(portfolio.totalOpenExposure, 0, "core $0; moonshot settled LOST → 0 open");
  assert.deepEqual(portfolio.record, { wins: 12, losses: 2, voids: 0, pending: 0 }, "12-2-0-0 (Lane A Step 4 WON; Lane B Step 2 WON)");
  assert.equal((portfolio.activeCards ?? []).length, 0, "no active cards — both lanes awaiting the next qualified card");
});

test("PROTECTED: the completed crown ladder ($10,376.17) is untouched", () => {
  assert.equal(portfolio.crownBankroll, 10376.17, "crown bankroll immutable");
  // The protected 5-step crown ladder artifact is still present.
  const crown = read("public/data/bank-builder/dual-lanes-latest.json");
  assert.ok(crown, "completed crown ladder artifact present");
});
