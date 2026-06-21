import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Emergency June 20 same-day-only invariant: no PUBLIC active/candidate surface may carry a
// future-slate (June 21+) leg. Settled historical legs (June 19) are fine — they are results,
// not today's picks. The slate date is June 20 ET, so a 00:00Z June 21 kickoff (= 8pm ET June 20,
// e.g. Ecuador/Curaçao) still counts as June 20; a 04:00Z+ June 21 kickoff is a future slate.
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const SLATE = "2026-06-20";
// ET = UTC-4 (EDT). Map a kickoff instant to its ET calendar date.
const etDate = (iso) => new Date(Date.parse(iso) - 4 * 3600 * 1000).toISOString().slice(0, 10);
const isFuture = (iso) => iso && etDate(iso) > SLATE;
const FUTURE_TEAMS = /Japan|Egypt|Belgium|Uruguay|Spain|Saudi|Iran|Cape Verde|New Zealand|Tunisia/i;

const bb = read("public/data/methodology/launch/dual-bank-builder-active.json").run;
const moon = read("public/data/moonshot-lane/active.json");
const portfolio = read("public/data/mr-dub/portfolio.json");

test("Bank Builder: no PLACED/ACTIVE step leg is a future slate (June 21+)", () => {
  for (const [id, lane] of [["lane-a", bb.laneA], ["lane-b", bb.laneB]]) {
    for (const s of lane.steps ?? []) {
      if (s.status === "pending" || s.status === "active") {
        for (const l of s.legs ?? []) {
          assert.ok(!isFuture(l.startTime), `${id} step ${s.step} open leg ${l.participantName} is future-slate (${l.startTime})`);
        }
      }
    }
  }
});

test("Bank Builder: no candidate leg is a future slate, and the known future teams are gone", () => {
  for (const [id, lane] of [["lane-a", bb.laneA], ["lane-b", bb.laneB]]) {
    const c = lane.nextCandidate;
    if (!c) continue;
    for (const l of c.legs ?? []) {
      assert.ok(!isFuture(l.startTime), `${id} candidate leg ${l.participantName} is future-slate (${l.startTime})`);
      assert.ok(!FUTURE_TEAMS.test(l.participantName ?? ""), `${id} candidate still carries a future-slate team: ${l.participantName}`);
    }
    // A removed candidate must still explain itself (no blank "Upcoming").
    assert.ok(typeof c.reason === "string" && c.reason.length > 20, `${id} candidate carries an honest reason`);
  }
});

test("Moonshot: no active or candidate leg is a future slate, future teams removed", () => {
  const c = moon.restartCandidate;
  for (const l of (c?.legs ?? [])) {
    assert.ok(!isFuture(l.startTime), `moonshot candidate leg ${l.participantName} is future-slate (${l.startTime})`);
    assert.ok(!FUTURE_TEAMS.test(l.participantName ?? ""), `moonshot candidate still carries a future-slate team: ${l.participantName}`);
  }
  if (c) assert.ok(typeof c.reason === "string" && c.reason.length > 20, "moonshot candidate carries an honest reason");
});

test("Mr. Dub: no open exposure — candidate-only surfaces never count as money at risk", () => {
  assert.equal(portfolio.openExposure, 0, "future-slate placement removed → exposure $0");
  assert.equal(portfolio.totalOpenExposure, 0, "no total exposure");
  assert.deepEqual(portfolio.record, { wins: 8, losses: 2, voids: 0, pending: 0 }, "8-2 after ledger reconciliation, no pending");
  assert.equal((portfolio.activeCards ?? []).length, 0, "no active cards");
});

test("PROTECTED: the completed crown ladder ($10,376.17) is untouched", () => {
  assert.equal(portfolio.crownBankroll, 10376.17, "crown bankroll immutable");
  // The protected 5-step crown ladder artifact is still present.
  const crown = read("public/data/bank-builder/dual-lanes-latest.json");
  assert.ok(crown, "completed crown ladder artifact present");
});
