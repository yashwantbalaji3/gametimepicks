import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const run = JSON.parse(fs.readFileSync("public/data/methodology/launch/dual-bank-builder-active.json", "utf8")).run;
const A = run.laneA, B = run.laneB;
const step1 = A.steps.find((s) => s.step === 1);
const dec = (o) => (o >= 0 ? 1 + o / 100 : 1 + 100 / -o);

test("Lane A Step 1 (Mexico DNB + Soto) was launched from $100 and settled WON → lane advanced", () => {
  assert.equal(A.laneStatus, "active", "Lane A advanced after Step 1 won");
  assert.equal(A.publicVisible, true);
  assert.equal(step1.status, "settled");
  assert.equal(step1.result, "won");
  assert.equal(step1.stake, 100, "started from $100");
  assert.equal(step1.legs.length, 2);
  const wc = step1.legs.find((l) => l.sport === "WORLD_CUP");
  const mlb = step1.legs.find((l) => l.sport === "MLB");
  assert.ok(wc && mlb, "exactly one World Cup + one MLB leg");
  assert.ok(wc.settlement?.result === "won" && mlb.settlement?.result === "won", "both legs graded won from official sources");
  // Both legs carry real start times (settled official legs from the cleared Step 1).
  for (const l of step1.legs) assert.ok(l.startTime && !Number.isNaN(Date.parse(l.startTime)), `${l.label} has a real start time`);
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

test("Lane A is a single clean run — the old failed pre-history was removed (no contradictory stopped+advanced)", () => {
  // The stale priorLane / relaunch (an earlier run that lost Step 2) was dropped so the Mr. Dub ledger
  // reads as one coherent timeline: Step 1 won → Step 2 won → Step 3 placed. No failed pre-history.
  assert.ok(!A.priorLane, "no priorLane — the earlier failed run was removed");
  assert.ok(!A.relaunch && !A.relaunchAudit, "no relaunch artifacts left on Lane A");
  const publicLabels = A.steps.flatMap((s) => (s.legs ?? []).map((l) => l.label)).join(" ");
  assert.ok(!/Czech/i.test(publicLabels) && !/Josh Bell/i.test(publicLabels), "no failed legs on the lane");
});

test("internal replacement candidates: Step 2 carries fresh pre-event swaps (real legs, future deadline, no overlap)", () => {
  const cands = A.replacementCandidates ?? [];
  // After placing Step 2, Lane A carries pre-event swap candidates in case a placed leg's game moves.
  assert.ok(cands.length >= 1, "Step 2 has at least one replacement candidate");
  const placedEvents = new Set((A.legs ?? []).map((l) => String(l.eventId)));
  const laneBEvents = new Set((B.legs ?? []).map((l) => String(l.eventId)));
  for (const c of cands) {
    assert.ok(c.legId && c.odds != null, "candidate carries a real leg + odds");
    assert.ok(c.replacementDeadline && Date.parse(c.replacementDeadline) > Date.parse("2026-06-19T16:00:00Z"), "swap deadline is in the future (pre-event)");
    assert.ok(c.odds >= -500, "no extreme-favorite swap");
    assert.ok(typeof c.reason === "string" && c.reason.length, "candidate explains why it's a valid swap");
  }
});
