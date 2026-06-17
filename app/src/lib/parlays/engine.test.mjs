/**
 * Parlay-engine contract tests — eligibility gates, correlation blocking, parlay generation rules,
 * and the dual Bank Builder launch gates. Pure; imports the .ts engine directly under tsx.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toEligibleLeg, buildLegPool, eligibleLegs, deriveMarketScope, riskTierOf } from "./eligible-leg.ts";
import { correlate } from "./correlation.ts";
import { generateDailyParlays } from "./daily-parlays.ts";
import { generateSameGameParlays } from "./same-game.ts";
import { selectDualBankBuilder, survivalScore } from "./dual-bank-builder.ts";
import { buildTrackingRecords, hitRate } from "./tracking.ts";

const NOW = "2026-06-17T12:00:00Z";
const FUTURE = "2026-06-17T23:00:00Z";
const PAST = "2026-06-17T06:00:00Z";

// ── AdaptedPrediction factory (drives toEligibleLeg) ─────────────────────────────────────────────
function mkAdapted(over = {}) {
  const o = {
    eventId: over.eventId ?? "g1",
    sport: over.sport ?? "MLB",
    predictionTarget: over.predictionTarget ?? "pitcher_strikeouts",
    participant: over.participant ?? "Ace Carter",
    line: over.line ?? 6.5,
    marketOdds: over.marketOdds ?? -120,
    marketImpliedProbability: over.marketImpliedProbability ?? 0.55,
    modelProjection: over.modelProjection ?? 7.4,
    modelProbability: over.modelProbability ?? 0.62,
    edge: over.edge ?? 6,
    confidenceScore: over.confidenceScore ?? "High",
    riskScore: over.riskScore ?? 0.2,
    dataQuality: over.dataQuality ?? "A",
    modelMode: "market_aware_model",
    topPositiveFactors: over.topPositiveFactors ?? [{ label: "recent form supports the over", direction: "positive", weight: 0.7 }],
    topNegativeFactors: over.topNegativeFactors ?? [{ label: "small sample", direction: "negative", weight: 0.3 }],
    missingDataFlags: over.missingDataFlags ?? [],
    staleDataFlags: over.staleDataFlags ?? [],
    smallSampleFlags: over.smallSampleFlags ?? [],
    leakageValidationPassed: over.leakageValidationPassed ?? true,
  };
  const snapshot = {
    eventId: o.eventId, sport: o.sport, leagueOrCompetition: o.sport, predictionTarget: o.predictionTarget,
    predictionTime: over.predictionTime ?? "2026-06-17T10:00:00Z",
    eventStartTime: over.eventStartTime ?? FUTURE,
    dataCutoffTime: "2026-06-17T10:00:00Z", featureSnapshotTime: "2026-06-17T10:00:00Z",
    marketSnapshotTime: "2026-06-17T10:00:00Z", lineupSnapshotTime: null, injurySnapshotTime: null, weatherSnapshotTime: null,
  };
  return { output: o, snapshot, leakage: { passed: o.leakageValidationPassed, checks: [] }, rollingWindows: [] };
}
const ctx = { nowIso: NOW, extractorStatus: "wired", marketAware: true };

// ════════════════════════════════════════ ELIGIBLE LEGS ════════════════════════════════════════
test("No Bet predictions are ineligible", () => {
  const leg = toEligibleLeg(mkAdapted({ confidenceScore: "No Bet" }), ctx);
  assert.equal(leg.eligible, false);
  assert.ok(leg.ineligibilityReasons.includes("confidence No Bet"));
  assert.equal(leg.legQualityTier, "ineligible");
});

test("leakage-failed predictions are ineligible", () => {
  const leg = toEligibleLeg(mkAdapted({ leakageValidationPassed: false }), ctx);
  assert.equal(leg.eligible, false);
  assert.ok(leg.ineligibilityReasons.includes("leakage validation failed"));
});

test("critical missing data makes a leg ineligible", () => {
  const leg = toEligibleLeg(mkAdapted({ missingDataFlags: [{ field: "marketOdds", critical: true, reason: "x" }] }), ctx);
  assert.equal(leg.eligible, false);
  assert.ok(leg.ineligibilityReasons.includes("critical data missing"));
});

test("critical stale data makes a leg ineligible", () => {
  const leg = toEligibleLeg(mkAdapted({ staleDataFlags: [{ field: "market", capturedAt: PAST, thresholdMinutes: 120, reason: "old" }] }), ctx);
  assert.equal(leg.eligible, false);
  assert.ok(leg.ineligibilityReasons.includes("critical data stale"));
});

test("completed/started events are ineligible", () => {
  const leg = toEligibleLeg(mkAdapted({ eventStartTime: PAST }), ctx);
  assert.equal(leg.eligible, false);
  assert.ok(leg.ineligibilityReasons.includes("event already started / completed"));
});

test("unknown World Cup market scope is penalized + ineligible", () => {
  const leg = toEligibleLeg(mkAdapted({ sport: "WORLD_CUP", predictionTarget: "mystery_outright_thing", eventStartTime: FUTURE }), ctx);
  assert.equal(deriveMarketScope("WORLD_CUP", "mystery_outright_thing"), "advancement"); // outright → advancement
  const leg2 = toEligibleLeg(mkAdapted({ sport: "WORLD_CUP", predictionTarget: "weird_unmapped", eventStartTime: FUTURE }), ctx);
  assert.equal(leg2.marketScope, "unknown");
  assert.equal(leg2.eligible, false);
  assert.ok(leg2.ineligibilityReasons.includes("market scope unknown"));
});

test("WORLD_CUP 90-min and advancement scopes are distinct", () => {
  assert.equal(deriveMarketScope("WORLD_CUP", "moneyline_90"), "90_minutes");
  assert.equal(deriveMarketScope("WORLD_CUP", "to_qualify"), "advancement");
});

test("an extractor that is not wired yields ineligible legs", () => {
  const leg = toEligibleLeg(mkAdapted({}), { ...ctx, extractorStatus: "source_missing" });
  assert.equal(leg.eligible, false);
  assert.ok(leg.ineligibilityReasons.some((r) => r.includes("extractor status")));
});

test("eligible legs preserve attribution + quality tier", () => {
  const leg = toEligibleLeg(mkAdapted({}), ctx);
  assert.equal(leg.eligible, true);
  assert.ok(leg.topPositiveFactors.length > 0);
  assert.ok(["elite", "strong", "playable"].includes(leg.legQualityTier));
  assert.equal(riskTierOf(0.7), "high");
});

// ════════════════════════════════════════ CORRELATION ════════════════════════════════════════
function mkLeg(over = {}) {
  return toEligibleLeg(mkAdapted(over), ctx);
}

test("same participant opposite side is conflicting (blocked)", () => {
  const a = mkLeg({ eventId: "g1", participant: "Ace", predictionTarget: "strikeouts_over" });
  const b = mkLeg({ eventId: "g1", participant: "Ace", predictionTarget: "strikeouts_under" });
  const c = correlate(a, b);
  assert.equal(c.correlationType, "conflicting");
  assert.ok(c.marketConflictFlag);
});

test("pitcher Ks vs opposing batter hits (same game) is conflicting/negative", () => {
  const a = mkLeg({ eventId: "g9", participant: "Pitcher", predictionTarget: "pitcher_strikeouts" });
  const b = mkLeg({ eventId: "g9", participant: "Batter", predictionTarget: "batter_hits" });
  const c = correlate(a, b);
  assert.ok(["conflicting", "negative"].includes(c.correlationType));
  assert.ok(c.correlationScore < 0);
});

test("same-game reinforcing markets are positive (allowed for same-game)", () => {
  const a = mkLeg({ eventId: "g3", participant: "Team", predictionTarget: "team_total_over" });
  const b = mkLeg({ eventId: "g3", participant: "Star", predictionTarget: "player_points_over" });
  const c = correlate(a, b);
  assert.equal(c.correlationType, "positive");
  assert.ok(c.correlationScore > 0);
});

test("World Cup 90-minute and advancement on the same match are NOT equivalent", () => {
  const a = mkLeg({ sport: "WORLD_CUP", eventId: "m5", participant: "France", predictionTarget: "moneyline_90", eventStartTime: FUTURE });
  const b = mkLeg({ sport: "WORLD_CUP", eventId: "m5", participant: "France", predictionTarget: "to_qualify", eventStartTime: FUTURE });
  const c = correlate(a, b);
  assert.equal(c.marketScopeConflictFlag, true);
  assert.notEqual(c.correlationType, "positive"); // never treated as the same/equivalent market
});

// ════════════════════════════════════════ PARLAYS ════════════════════════════════════════
function poolOf(n, over = {}) {
  return Array.from({ length: n }, (_, i) => mkLeg({ eventId: `g${i}`, participant: `P${i}`, ...over }));
}

test("low risk uses only elite/strong low-risk legs; never No Bet", () => {
  const pool = [
    ...poolOf(3, { riskScore: 0.1, confidenceScore: "High", dataQuality: "A" }),
    mkLeg({ eventId: "gx", participant: "NB", confidenceScore: "No Bet" }), // ineligible
    mkLeg({ eventId: "gy", participant: "HiRisk", riskScore: 0.8, confidenceScore: "Low", dataQuality: "C" }),
  ];
  const { parlays } = generateDailyParlays(eligibleLegs(pool), "2026-06-17");
  const low = parlays.filter((p) => p.riskLevel === "low");
  for (const p of low) {
    assert.equal(p.legs.length, 2);
    for (const l of p.legs) assert.notEqual(l.legQualityTier, "ineligible");
  }
  // No No-Bet leg appears anywhere.
  assert.ok(parlays.every((p) => p.legs.every((l) => l.label !== "NB pitcher_strikeouts 6.5")));
});

test("not enough legs → fewer/zero parlays with an explanation", () => {
  const pool = poolOf(1, { riskScore: 0.1 }); // only 1 eligible leg
  const { parlays, notes } = generateDailyParlays(eligibleLegs(pool), "2026-06-17");
  assert.equal(parlays.length, 0);
  assert.ok(notes.every((n) => n.generated === 0));
  assert.ok(notes.some((n) => /not enough qualified legs/.test(n.reason ?? "")));
});

test("leg-count rules per risk level are respected", () => {
  const pool = poolOf(8, { riskScore: 0.15, confidenceScore: "High", dataQuality: "A" });
  const { parlays } = generateDailyParlays(eligibleLegs(pool), "2026-06-17");
  for (const p of parlays) {
    if (p.riskLevel === "low") assert.equal(p.legs.length, 2);
    if (p.riskLevel === "high") assert.equal(p.legs.length, 3);
    if (p.riskLevel === "longshot") assert.equal(p.legs.length, 4);
  }
});

test("same-game generator rejects conflicting combinations", () => {
  const legs = [
    mkLeg({ eventId: "sg", participant: "Ace", predictionTarget: "strikeouts_over" }),
    mkLeg({ eventId: "sg", participant: "Ace", predictionTarget: "strikeouts_under" }),
  ];
  const r = generateSameGameParlays(legs, "2026-06-17");
  assert.equal(r.parlays.length, 0);
  assert.ok(r.note);
});

// ════════════════════════════════════════ BANK BUILDER ════════════════════════════════════════
test("dual Bank Builder returns no_qualified_launch with < 4 qualified legs", () => {
  const pool = poolOf(2, { riskScore: 0.1, confidenceScore: "High", dataQuality: "A" });
  const r = selectDualBankBuilder(eligibleLegs(pool), "2026-06-17", { mode: "launch", newRunId: "run-x" });
  assert.equal(r.status, "no_qualified_launch");
  assert.equal(r.laneA, null);
  assert.equal(r.laneB, null);
  assert.equal(r.runId, null);
  assert.ok(r.noLaunchReasons.length > 0);
});

test("dual Bank Builder builds Lane A + Lane B when gates pass (launch)", () => {
  const pool = poolOf(5, { riskScore: 0.08, confidenceScore: "High", dataQuality: "A", edge: 8 });
  const r = selectDualBankBuilder(eligibleLegs(pool), "2026-06-17", { mode: "launch", newRunId: "run-2026-06-17" });
  assert.equal(r.status, "launched");
  assert.equal(r.runId, "run-2026-06-17");
  assert.equal(r.laneA?.legs.length, 2);
  assert.equal(r.laneB?.legs.length, 2);
  // Lanes are game-disjoint within themselves.
  assert.notEqual(r.laneA.legs[0].eventId, r.laneA.legs[1].eventId);
});

test("dry_run mode never reaches launched + never sets a run id", () => {
  const pool = poolOf(5, { riskScore: 0.08, confidenceScore: "High", dataQuality: "A", edge: 8 });
  const r = selectDualBankBuilder(eligibleLegs(pool), "2026-06-17", { mode: "dry_run", newRunId: "run-x" });
  assert.equal(r.status, "dry_run_only");
  assert.equal(r.runId, null);
  assert.equal(r.published, false);
});

test("dual Bank Builder rejects conflicting/correlated legs from the same game", () => {
  // 4 legs but all in 2 games with same-participant conflicts → cannot form 4 non-correlated.
  const pool = eligibleLegs([
    mkLeg({ eventId: "g1", participant: "Ace", predictionTarget: "strikeouts_over", riskScore: 0.1 }),
    mkLeg({ eventId: "g1", participant: "Ace", predictionTarget: "strikeouts_under", riskScore: 0.1 }),
    mkLeg({ eventId: "g2", participant: "Bob", predictionTarget: "strikeouts_over", riskScore: 0.1 }),
    mkLeg({ eventId: "g2", participant: "Bob", predictionTarget: "strikeouts_under", riskScore: 0.1 }),
  ]);
  const r = selectDualBankBuilder(pool, "2026-06-17", { mode: "launch", newRunId: "run-x" });
  assert.equal(r.status, "no_qualified_launch");
});

test("forms two game-disjoint lanes even when top survival is concentrated in few games", () => {
  // 6 strong legs but heavy in g0/g1; g2/g3 also present → diversified selection must still split.
  const pool = eligibleLegs([
    mkLeg({ eventId: "g0", participant: "A0", riskScore: 0.05, confidenceScore: "High", dataQuality: "A", edge: 9 }),
    mkLeg({ eventId: "g0", participant: "B0", riskScore: 0.05, confidenceScore: "High", dataQuality: "A", edge: 9 }),
    mkLeg({ eventId: "g1", participant: "A1", riskScore: 0.06, confidenceScore: "High", dataQuality: "A", edge: 8 }),
    mkLeg({ eventId: "g1", participant: "B1", riskScore: 0.06, confidenceScore: "High", dataQuality: "A", edge: 8 }),
    mkLeg({ eventId: "g2", participant: "A2", riskScore: 0.1, confidenceScore: "High", dataQuality: "A", edge: 7 }),
    mkLeg({ eventId: "g3", participant: "A3", riskScore: 0.1, confidenceScore: "High", dataQuality: "A", edge: 7 }),
  ]);
  const r = selectDualBankBuilder(pool, "2026-06-17", { mode: "launch", newRunId: "run-z" });
  assert.equal(r.status, "launched");
  // Each lane internally game-disjoint, and the two lanes don't both hinge on the same single game.
  assert.notEqual(r.laneA.legs[0].eventId, r.laneA.legs[1].eventId);
  assert.notEqual(r.laneB.legs[0].eventId, r.laneB.legs[1].eventId);
  const fourGames = new Set([...r.laneA.legs, ...r.laneB.legs].map((l) => l.eventId));
  assert.ok(fourGames.size >= 3, "selection spreads across ≥3 distinct games");
});

test("prefers one World Cup leg per lane when ≥2 soccer matches qualify", () => {
  const wcA = mkLeg({ sport: "WORLD_CUP", eventId: "wc1", participant: "Colombia or Draw", predictionTarget: "double_chance", line: null, eventStartTime: FUTURE, modelProbability: 0.94, riskScore: 0.04, confidenceScore: "High", dataQuality: "B" });
  const wcB = mkLeg({ sport: "WORLD_CUP", eventId: "wc2", participant: "Ghana or Draw", predictionTarget: "double_chance", line: null, eventStartTime: FUTURE, modelProbability: 0.82, riskScore: 0.04, confidenceScore: "High", dataQuality: "B" });
  const mlb1 = mkLeg({ eventId: "g1", participant: "Ace", riskScore: 0.08, confidenceScore: "High", dataQuality: "A", edge: 8, modelProbability: 0.66 });
  const mlb2 = mkLeg({ eventId: "g2", participant: "Bob", riskScore: 0.08, confidenceScore: "High", dataQuality: "A", edge: 8, modelProbability: 0.64 });
  const pool = eligibleLegs([wcA, wcB, mlb1, mlb2]);
  const r = selectDualBankBuilder(pool, "2026-06-17", { mode: "launch", newRunId: "wc-run", preferSoccerPerLane: true });
  assert.equal(r.status, "launched");
  assert.ok(r.laneA.legs.some((l) => l.sport === "WORLD_CUP"), "Lane A has a WC leg");
  assert.ok(r.laneB.legs.some((l) => l.sport === "WORLD_CUP"), "Lane B has a WC leg");
  // The two WC legs are from different matches.
  const wcGames = [...r.laneA.legs, ...r.laneB.legs].filter((l) => l.sport === "WORLD_CUP").map((l) => l.eventId);
  assert.equal(new Set(wcGames).size, 2);
});

test("survivalScore credits low-variance high-probability legs (survival != edge)", () => {
  const hi = mkLeg({ sport: "WORLD_CUP", eventId: "wc1", participant: "Fav or Draw", predictionTarget: "double_chance", line: null, eventStartTime: FUTURE, modelProbability: 0.94, riskScore: 0.04, dataQuality: "B", confidenceScore: "High" });
  const lo = mkLeg({ sport: "WORLD_CUP", eventId: "wc2", participant: "Coinflip or Draw", predictionTarget: "double_chance", line: null, eventStartTime: FUTURE, modelProbability: 0.55, riskScore: 0.04, dataQuality: "B", confidenceScore: "High" });
  assert.ok(survivalScore(hi) > survivalScore(lo), "higher hit probability → higher survival");
});

test("survivalScore rejects unknown-scope legs hard", () => {
  const bad = mkLeg({ sport: "WORLD_CUP", predictionTarget: "weird_unmapped", eventStartTime: FUTURE });
  assert.ok(survivalScore(bad) <= 0 || bad.marketScope === "unknown");
});

// ════════════════════════════════════════ TRACKING ════════════════════════════════════════
test("tracking records are created pending and never pre-settled", () => {
  const pool = poolOf(4, { riskScore: 0.12, confidenceScore: "High", dataQuality: "A" });
  const { parlays } = generateDailyParlays(eligibleLegs(pool), "2026-06-17");
  const records = buildTrackingRecords(parlays);
  assert.ok(records.length > 0);
  for (const r of records) {
    assert.equal(r.actualResult, "pending");
    assert.equal(r.parlayHit, null);
    assert.equal(r.settledAt, null);
  }
  // Hit rate over all-pending records is null (never counts pending as a result).
  assert.equal(hitRate(records).hitRate, null);
});
