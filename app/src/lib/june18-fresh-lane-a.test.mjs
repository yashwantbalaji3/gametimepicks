import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const run = JSON.parse(fs.readFileSync("public/data/methodology/launch/dual-bank-builder-active.json", "utf8")).run;
const A = run.laneA, B = run.laneB;
const step1 = A.steps.find((s) => s.step === 1);
const dec = (o) => (o >= 0 ? 1 + o / 100 : 1 + 100 / -o);

test("fresh Lane A Step 1: two brand-new pre-event legs (one World Cup, one MLB), launched from $100", () => {
  assert.equal(A.laneStatus, "active");
  assert.equal(A.publicVisible, true);
  assert.equal(step1.status, "pending");
  assert.equal(step1.stake, 100, "starts from $100");
  assert.equal(step1.legs.length, 2);
  const wc = step1.legs.find((l) => l.sport === "WORLD_CUP");
  const mlb = step1.legs.find((l) => l.sport === "MLB");
  assert.ok(wc && mlb, "exactly one World Cup + one MLB leg");
  // Both legs are pre-event relative to the launch moment (no started/live/completed games).
  const launchedMs = Date.parse(A.relaunch.launchedAt);
  for (const l of step1.legs) assert.ok(Date.parse(l.startTime) > launchedMs, `${l.label} is pre-event at launch`);
});

test("fresh Lane A Step 1: targets ~$200 with near-+100 combined odds, no longshot / no ultra-short", () => {
  const combined = step1.legs.reduce((d, l) => d * dec(l.odds), 1);
  assert.ok(Math.abs(combined * 100 - step1.projectedPayout) < 1, "projected payout matches combined odds × $100");
  assert.ok(step1.projectedPayout >= 190 && step1.projectedPayout <= 225, "projected return in the $190–225 band");
  assert.ok(step1.combinedOdds >= -130 && step1.combinedOdds <= 140, "combined odds near +100");
  // No ultra-short or longshot single leg.
  for (const l of step1.legs) assert.ok(l.odds >= -360 && l.odds <= 200, `${l.label} odds ${l.odds} not ultra-short/longshot`);
});

test("fresh Lane A excludes the failed Czech leg, the old Josh Bell leg, and all Lane B legs", () => {
  const laneBIds = new Set((B.steps ?? []).flatMap((s) => (s.legs ?? []).map((l) => l.legId)));
  for (const l of step1.legs) {
    assert.ok(!/Czech/i.test(l.label), "no Czech leg");
    assert.ok(!/Josh Bell/i.test(l.label), "no Josh Bell leg");
    assert.ok(!laneBIds.has(l.legId), "no Lane B leg reused");
  }
  // Cross-sport legs are independent (a World Cup match and an MLB game cannot correlate).
  assert.notEqual(step1.legs[0].eventId, step1.legs[1].eventId, "two distinct events");
});

test("prior stopped Lane A history is preserved (old won + lost steps) for Mr. Dub, hidden from public", () => {
  assert.ok(A.priorLane && Array.isArray(A.priorLane.steps), "priorLane retained");
  const results = A.priorLane.steps.map((s) => s.result).sort();
  assert.deepEqual(results, ["lost", "won"], "old Step 1 won + Step 2 lost preserved");
  // The public lane's visible steps no longer surface the Czech failure.
  const publicLabels = A.steps.flatMap((s) => (s.legs ?? []).map((l) => l.label)).join(" ");
  assert.ok(!/Czech/i.test(publicLabels) && !/Josh Bell/i.test(publicLabels), "no failed legs on the public lane");
});

test("internal replacement candidates: MLB swaps generated, none from started/postponed or in-use games", () => {
  const cands = A.replacementCandidates ?? [];
  const laneBEvents = new Set((B.steps ?? []).flatMap((s) => (s.legs ?? []).map((l) => String(l.eventId))));
  const ownEvents = new Set(step1.legs.map((l) => String(l.eventId)));
  for (const c of cands) {
    assert.ok(c.newLeg && c.newLeg.startTime, "candidate carries a real leg + start time");
    assert.ok(!laneBEvents.has(String(c.newLeg.eventId)), "no Lane B game");
    assert.ok(!ownEvents.has(String(c.newLeg.eventId)), "not the same game as the leg it replaces");
    assert.notEqual(String(c.newLeg.eventId), "e92122c8f905eb41a57faabf21daf468", "not the postponed SF@ATL game");
    assert.ok(c.validUntil && Date.parse(c.validUntil) > Date.parse(A.relaunch.launchedAt), "candidate window is in the future");
  }
});
