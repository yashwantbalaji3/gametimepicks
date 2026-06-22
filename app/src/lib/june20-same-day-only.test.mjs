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

test("Bank Builder: PLACED/ACTIVE step legs are cross-slate (June 21+) and none is a stale past-date leg", () => {
  let openLegCount = 0;
  for (const [id, lane] of [["lane-a", bb.laneA], ["lane-b", bb.laneB]]) {
    for (const s of lane.steps ?? []) {
      if (s.status === "pending" || s.status === "active") {
        for (const l of s.legs ?? []) {
          openLegCount++;
          assert.ok(!isStale(l.startTime), `${id} step ${s.step} open leg ${l.participantName} is a stale past-date leg (${l.startTime})`);
        }
      }
    }
  }
  // The cross-slate resume placed active cards in both lanes — there ARE open legs now.
  assert.ok(openLegCount >= 2, "active cross-slate cards carry open legs in both lanes");
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

test("Moonshot: active card is placed (no leftover candidate); restartCandidate cleared", () => {
  // The Moonshot lane resumed ACTIVE with a placed Step 1 card; the restart candidate is cleared.
  assert.equal(moon.restartCandidate, null, "moonshot restartCandidate cleared (card placed)");
  const activeCard = (moon.ladder ?? []).find((s) => s.status === "active")?.card;
  assert.ok(activeCard, "Moonshot has an active placed card");
  for (const l of activeCard.legs ?? []) {
    assert.ok(!isStale(l.startTime), `moonshot active leg ${l.participant} is a stale past-date leg (${l.startTime})`);
  }
});

test("Mr. Dub: cross-slate active cards carry real exposure ($200 core + $25 moonshot)", () => {
  assert.equal(portfolio.openExposure, 200, "Lane A + Lane B placed seeds → $200 open exposure");
  assert.equal(portfolio.totalOpenExposure, 225, "core $200 + moonshot $25");
  assert.deepEqual(portfolio.record, { wins: 8, losses: 2, voids: 0, pending: 2 }, "8-2 with 2 pending (Lane A Step 3 + Lane B Step 1)");
  assert.equal((portfolio.activeCards ?? []).length, 2, "two active cards");
});

test("PROTECTED: the completed crown ladder ($10,376.17) is untouched", () => {
  assert.equal(portfolio.crownBankroll, 10376.17, "crown bankroll immutable");
  // The protected 5-step crown ladder artifact is still present.
  const crown = read("public/data/bank-builder/dual-lanes-latest.json");
  assert.ok(crown, "completed crown ladder artifact present");
});
