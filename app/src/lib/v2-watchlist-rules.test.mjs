/**
 * Tests for v2-watchlist-rules — internal, OFF-by-default leg tagging. Proves it
 * fails closed on missing data, never auto-enables, and emits no banned language.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ENABLE_V2_SHADOW_CANDIDATE,
  classifyV2WatchlistLeg,
  summarizeV2Watchlist,
  explainFailedLaunchGates,
  WATCHLIST_RULES,
} from "./v2-watchlist-rules.ts";

const leg = (o) => ({ sport: "mlb", market: "batter_hits", side: "Over", line: 0.5, oddsForSide: -200, l5hits: 5, ...o });

test("hard off switch is false", () => {
  assert.equal(ENABLE_V2_SHADOW_CANDIDATE, false);
});

test("5/5 & heavy favorite batter_hits matches both low_gate and batter_hits_low_gate", () => {
  assert.deepEqual(classifyV2WatchlistLeg(leg()), ["low_gate", "batter_hits_low_gate"]);
});

test("5/5 & heavy favorite non-hits market matches low_gate only", () => {
  assert.deepEqual(classifyV2WatchlistLeg(leg({ market: "pitcher_strikeouts" })), ["low_gate"]);
});

test("odds lighter than -150 does not match", () => {
  assert.deepEqual(classifyV2WatchlistLeg(leg({ oddsForSide: -120 })), []);
});

test("L5 below 5/5 does not match", () => {
  assert.deepEqual(classifyV2WatchlistLeg(leg({ l5hits: 4 })), []);
});

test("missing L5 data fails closed (no match)", () => {
  assert.deepEqual(classifyV2WatchlistLeg(leg({ l5hits: null })), []);
});

test("non-MLB fails closed", () => {
  assert.deepEqual(classifyV2WatchlistLeg(leg({ sport: "nba" })), []);
});

test("deterministic", () => {
  const a = classifyV2WatchlistLeg(leg());
  const b = classifyV2WatchlistLeg(leg());
  assert.deepEqual(a, b);
});

test("summarize counts by rule and market", () => {
  const legs = [
    leg(),
    leg({ market: "pitcher_strikeouts", line: 4.5 }),
    leg({ l5hits: 3 }), // not on watchlist
  ];
  const s = summarizeV2Watchlist(legs);
  assert.equal(s.total, 2);
  assert.equal(s.byRule.low_gate, 2);
  assert.equal(s.byRule.batter_hits_low_gate, 1);
  assert.equal(s.byMarket.batter_hits, 1);
});

test("explainFailedLaunchGates returns the corrected-CI reason", () => {
  const reasons = explainFailedLaunchGates("low_gate");
  assert.ok(reasons.length >= 1);
  assert.ok(reasons.some((r) => /corrected|multiple-comparisons/i.test(r)));
  assert.deepEqual(explainFailedLaunchGates("unknown_segment"), []);
});

test("emits no banned public copy", () => {
  const blob = JSON.stringify({
    rules: WATCHLIST_RULES.map((r) => ({ label: r.label, gates: r.failedGates })),
    explain: explainFailedLaunchGates("low_gate").concat(explainFailedLaunchGates("batter_hits_low_gate")),
  }).toLowerCase();
  for (const banned of ["safe", "safer", "guaranteed", "lock", "risk-free", "sure thing", "better hit rate", "new model"]) {
    assert.ok(!blob.includes(banned), `must not contain "${banned}"`);
  }
});
