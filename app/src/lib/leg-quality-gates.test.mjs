/**
 * Tests for the leg-quality gate evaluator (Phase 11 risk-quality audit).
 *
 * Two jobs:
 *   1. Pin the evaluator semantics against
 *      `pipeline/parlay_optimizer.py::is_eligible` (side / confidence /
 *      edge / recent10 / DNP guard / pid / anomaly / star / MLB market).
 *   2. Pin the mirror presets to the documented Python `ProfileRules`
 *      thresholds so any drift fails CI.
 *
 * This module is a non-authoritative explainer mirror — it composes no
 * lane and grades nothing. These tests guard the mirror, not the live
 * optimizer (the Python tests own that).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateLegQualityGate,
  PROFILE_LEG_GATES,
  PROPOSED_SECTION_LEG_GATES,
  PUBLIC_SECTION_LEG_GATE_TODAY,
} from "./leg-quality-gates.ts";

/** A leg that clears the strictest (conservative) gate. Override fields
 *  per-test to exercise a single failing dimension. */
function goodNbaLeg(over = {}) {
  return {
    sport: "nba",
    side: "Over",
    confidence: "High",
    edgePct: 5.0,
    recent10Count: 10,
    recentSeries: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    playerId: 201939,
    isAnomaly: false,
    starTier: "superstar",
    market: "PTS",
    ...over,
  };
}

function goodMlbLeg(over = {}) {
  return {
    sport: "mlb",
    side: "Over",
    confidence: "High",
    edgePct: 5.0,
    // For MLB, Python derives recent10Count FROM recentSeries
    // (normalize_lean line 427), so they're equal in real data. We keep
    // this high so the sport-agnostic requireRecent10 floor (5) never
    // masks the MLB-specific recentSeries-length DNP guard under test.
    recent10Count: 7,
    recentSeries: [1, 1, 0, 2, 1, 1, 0], // length 7
    playerId: 12345,
    isAnomaly: false,
    starTier: "core",
    market: "batter_hits",
    ...over,
  };
}

test("a high-quality NBA leg clears the conservative gate", () => {
  const r = evaluateLegQualityGate(goodNbaLeg(), PROFILE_LEG_GATES.conservative);
  assert.equal(r.passes, true);
  assert.deepEqual(r.failures, []);
});

test("a high-quality MLB hits leg clears the conservative gate", () => {
  const r = evaluateLegQualityGate(goodMlbLeg(), PROFILE_LEG_GATES.conservative);
  assert.equal(r.passes, true);
});

test("Pass side is rejected on every gate", () => {
  for (const key of Object.keys(PROFILE_LEG_GATES)) {
    const r = evaluateLegQualityGate(
      goodNbaLeg({ side: "Pass" }),
      PROFILE_LEG_GATES[key],
    );
    assert.equal(r.passes, false, `expected Pass rejected by ${key}`);
    assert.ok(r.failures.some((f) => f.includes("Over/Under")));
  }
});

test("Sprint 035: a confidence tier never causes a gate failure, on any profile", () => {
  // Previously "Low" was rejected by conservative/balanced. That gate selected FOR the worst bucket:
  // on 21,192 settled rows "High" hit .4934 and "Low" .5172. No tier may gate eligibility now.
  for (const tier of ["High", "Medium", "Low"]) {
    const leg = goodNbaLeg({ confidence: tier, recent10Count: 10 });
    for (const profile of ["conservative", "balanced", "aggressive", "star_power"]) {
      const r = evaluateLegQualityGate(leg, PROFILE_LEG_GATES[profile]);
      assert.ok(
        !r.failures.some((f) => f.toLowerCase().includes("confidence")),
        `${profile}/${tier}: confidence must never appear as a failure reason (got ${JSON.stringify(r.failures)})`,
      );
    }
  }
});

test("edge floor: 1.5pp fails conservative(3) + balanced(2), passes aggressive(1)", () => {
  const leg = goodNbaLeg({ edgePct: 1.5, confidence: "High", recent10Count: 3 });
  assert.equal(
    evaluateLegQualityGate(leg, PROFILE_LEG_GATES.conservative).passes,
    false,
  );
  assert.equal(
    evaluateLegQualityGate(leg, PROFILE_LEG_GATES.balanced).passes,
    false,
  );
  assert.equal(
    evaluateLegQualityGate(leg, PROFILE_LEG_GATES.aggressive).passes,
    true,
  );
});

test("Sprint 035: a missing or tiny edge never causes a gate failure", () => {
  // There is no edge floor any more, so a null edge must pass rather than be rejected. Ranking or
  // gating by the model-vs-market difference promoted the worst-performing rows.
  for (const edgePct of [null, 0, 0.5, 25]) {
    for (const profile of ["conservative", "balanced", "aggressive", "star_power"]) {
      const r = evaluateLegQualityGate(goodNbaLeg({ edgePct }), PROFILE_LEG_GATES[profile]);
      assert.ok(
        !r.failures.some((f) => f.toLowerCase().includes("edge")),
        `${profile}/edge=${edgePct}: edge must never appear as a failure reason (got ${JSON.stringify(r.failures)})`,
      );
    }
  }
});

test("NBA DNP guard: recent10Count 6 fails conservative(7), passes balanced(5)", () => {
  const leg = goodNbaLeg({ recent10Count: 6 });
  const cons = evaluateLegQualityGate(leg, PROFILE_LEG_GATES.conservative);
  assert.equal(cons.passes, false);
  assert.ok(cons.failures.some((f) => f.includes("DNP guard")));
  // balanced needs >= 5 and High|Medium; 6 >= 5 passes.
  assert.equal(
    evaluateLegQualityGate(leg, PROFILE_LEG_GATES.balanced).passes,
    true,
  );
});

test("NBA legacy requireRecent10 floor (5) fires before the DNP guard", () => {
  // recent10Count 4: conservative requireRecent10=true rejects at the
  // legacy floor AND the DNP guard (7). Both reasons collected.
  const leg = goodNbaLeg({ recent10Count: 4 });
  const r = evaluateLegQualityGate(leg, PROFILE_LEG_GATES.conservative);
  assert.equal(r.passes, false);
  assert.ok(r.failures.some((f) => f.includes("legacy floor 5")));
  assert.ok(r.failures.some((f) => f.includes("DNP guard 7")));
});

test("MLB DNP guard reads recentSeries length, not recent10Count", () => {
  // length 4 < conservative 5 → fail; >= aggressive 3 → pass.
  const shortSeries = goodMlbLeg({ recentSeries: [1, 0, 2, 1] });
  assert.equal(
    evaluateLegQualityGate(shortSeries, PROFILE_LEG_GATES.conservative).passes,
    false,
  );
  assert.equal(
    evaluateLegQualityGate(shortSeries, PROFILE_LEG_GATES.aggressive).passes,
    true,
  );
  // Missing series entirely → length 0, fails even aggressive(3).
  const noSeries = goodMlbLeg({ recentSeries: null });
  const r = evaluateLegQualityGate(noSeries, PROFILE_LEG_GATES.aggressive);
  assert.equal(r.passes, false);
  assert.ok(r.failures.some((f) => f.includes("recentSeries length 0")));
});

test("requireValidPlayerId: non-positive id fails conservative, ignored by aggressive", () => {
  const leg = goodNbaLeg({ playerId: 0, confidence: "Low", recent10Count: 3 });
  const cons = evaluateLegQualityGate(leg, PROFILE_LEG_GATES.conservative);
  assert.ok(cons.failures.some((f) => f.includes("playerId")));
  // aggressive has requireValidPlayerId=false → no pid failure.
  const agg = evaluateLegQualityGate(leg, PROFILE_LEG_GATES.aggressive);
  assert.ok(!agg.failures.some((f) => f.includes("playerId")));
  assert.equal(agg.passes, true);
});

test("excludeAnomalies: anomaly leg blocked by conservative, allowed by aggressive", () => {
  const leg = goodNbaLeg({ isAnomaly: true, confidence: "Low", recent10Count: 3 });
  assert.equal(
    evaluateLegQualityGate(leg, PROFILE_LEG_GATES.conservative).passes,
    false,
  );
  // aggressive excludeAnomalies=false → the anomaly itself isn't a blocker.
  const agg = evaluateLegQualityGate(leg, PROFILE_LEG_GATES.aggressive);
  assert.ok(!agg.failures.some((f) => f.includes("anomaly")));
});

test("requireStar: a non-star leg only fails the star-only (Star Power) gate", () => {
  const leg = goodNbaLeg({ starTier: "none" });
  const star = evaluateLegQualityGate(leg, PROFILE_LEG_GATES.star_power);
  assert.equal(star.passes, false);
  assert.ok(star.failures.some((f) => f.includes("star-only")));
  // Conservative doesn't require a star.
  assert.equal(
    evaluateLegQualityGate(leg, PROFILE_LEG_GATES.conservative).passes,
    true,
  );
});

test("MLB market allowlist: strikeouts blocked from conservative, allowed in aggressive", () => {
  const k = goodMlbLeg({ market: "pitcher_strikeouts" });
  const cons = evaluateLegQualityGate(k, PROFILE_LEG_GATES.conservative);
  assert.equal(cons.passes, false);
  assert.ok(cons.failures.some((f) => f.includes("allowlist")));
  assert.equal(
    evaluateLegQualityGate(k, PROFILE_LEG_GATES.aggressive).passes,
    true,
  );
  // Star Power excludes strikeouts too (batters-only lane).
  assert.equal(
    evaluateLegQualityGate(k, PROFILE_LEG_GATES.star_power).passes,
    false,
  );
});

test("NBA legs ignore the MLB market allowlist", () => {
  // An NBA PTS leg must never be rejected for "not an MLB market".
  const leg = goodNbaLeg({ market: "PTS" });
  const r = evaluateLegQualityGate(leg, PROFILE_LEG_GATES.conservative);
  assert.equal(r.passes, true);
  assert.ok(!r.failures.some((f) => f.includes("allowlist")));
});

test("collects MULTIPLE failure reasons rather than short-circuiting", () => {
  // Sprint 035: confidence and edge no longer fail a leg, so this exercises the DATA gates that
  // remain — thin recent-10, missing player id, and an anomaly flag on the conservative profile.
  const leg = goodNbaLeg({
    recent10Count: 2,
    playerId: null,
    riskFlags: ["suspicious_edge"],
  });
  const r = evaluateLegQualityGate(leg, PROFILE_LEG_GATES.conservative);
  assert.equal(r.passes, false);
  assert.ok(r.failures.length >= 2, `expected >=2 data-quality reasons, got ${JSON.stringify(r.failures)}`);
  assert.ok(
    !r.failures.some((f) => /confidence|edge/i.test(f)),
    "the remaining failures must all be data-quality, not signal-quality",
  );
});

// ─── Preset in step with Python `ProfileRules` ─────────────────────────

test("conservative preset matches documented Python thresholds", () => {
  const g = PROFILE_LEG_GATES.conservative;
  assert.deepEqual(g.confidence, ["High", "Medium", "Low"], "Sprint 035: confidence must not gate eligibility");
  assert.equal(g.minEdgePct, 0, "Sprint 035: no profile may set a positive edge floor");
  assert.equal(g.requireRecent10, true);
  assert.equal(g.requireValidPlayerId, true);
  assert.equal(g.excludeAnomalies, true);
  assert.equal(g.requireStar, false);
  assert.equal(g.dnpMinNbaRecent10, 7);
  assert.equal(g.dnpMinMlbSeries, 5);
  assert.deepEqual(g.mlbAllowedMarkets, ["batter_hits", "batter_total_bases"]);
});

test("balanced preset matches documented Python thresholds", () => {
  const g = PROFILE_LEG_GATES.balanced;
  assert.deepEqual(g.confidence, ["High", "Medium", "Low"], "Sprint 035: confidence must not gate eligibility");
  assert.equal(g.minEdgePct, 0, "Sprint 035: no profile may set a positive edge floor");
  assert.equal(g.requireRecent10, false);
  assert.equal(g.requireValidPlayerId, true);
  assert.equal(g.excludeAnomalies, true);
  assert.equal(g.dnpMinNbaRecent10, 5);
  assert.equal(g.dnpMinMlbSeries, 5);
  assert.deepEqual(g.mlbAllowedMarkets, [
    "batter_hits",
    "batter_total_bases",
    "batter_hits_runs_rbis",
    "pitcher_strikeouts",
  ]);
});

test("aggressive preset matches documented Python thresholds", () => {
  const g = PROFILE_LEG_GATES.aggressive;
  assert.deepEqual(g.confidence, ["High", "Medium", "Low"], "Sprint 035: confidence must not gate eligibility");
  assert.equal(g.minEdgePct, 0, "Sprint 035: no profile may set a positive edge floor");
  assert.equal(g.requireRecent10, false);
  assert.equal(g.requireValidPlayerId, false);
  assert.equal(g.excludeAnomalies, false);
  assert.equal(g.requireStar, false);
  assert.equal(g.dnpMinNbaRecent10, 3);
  assert.equal(g.dnpMinMlbSeries, 3);
});

test("star_power preset matches documented Python thresholds", () => {
  const g = PROFILE_LEG_GATES.star_power;
  assert.deepEqual(g.confidence, ["High", "Medium", "Low"], "Sprint 035: confidence must not gate eligibility");
  assert.equal(g.minEdgePct, 0, "Sprint 035: no profile may set a positive edge floor");
  assert.equal(g.requireRecent10, true);
  assert.equal(g.requireValidPlayerId, true);
  assert.equal(g.excludeAnomalies, true);
  assert.equal(g.requireStar, true);
  assert.equal(g.dnpMinNbaRecent10, 7);
  assert.equal(g.dnpMinMlbSeries, 5);
  assert.deepEqual(g.mlbAllowedMarkets, [
    "batter_hits",
    "batter_total_bases",
    "batter_hits_runs_rbis",
  ]);
});

test("today's public-section gate is the aggressive gate (honest audit finding)", () => {
  // Documents reality: every public Low/Medium/High/Longshot section
  // inherits the most-permissive (aggressive) per-leg bar; section is
  // odds+legs only. Pin that so a silent retightening can't slip in
  // undocumented.
  assert.equal(PUBLIC_SECTION_LEG_GATE_TODAY, PROFILE_LEG_GATES.aggressive);
});

test("PROPOSED section ladder tightens the per-leg bar as risk drops", () => {
  // Proposal only — never enforced by the optimizer. Asserts the ladder
  // is monotonic in the obvious dimensions so the doc and code agree.
  const low = PROPOSED_SECTION_LEG_GATES.low;
  const med = PROPOSED_SECTION_LEG_GATES.medium;
  const high = PROPOSED_SECTION_LEG_GATES.high;
  const longshot = PROPOSED_SECTION_LEG_GATES.longshot;
  // Edge floor: low >= medium >= high >= longshot.
  assert.ok(low.minEdgePct >= med.minEdgePct);
  assert.ok(med.minEdgePct >= high.minEdgePct);
  assert.ok(high.minEdgePct >= longshot.minEdgePct);
  // Confidence breadth widens as risk rises.
  assert.ok(low.confidence.length <= med.confidence.length);
  assert.ok(med.confidence.length <= high.confidence.length);
  // Low/Medium exclude anomalies; High/Longshot tolerate them.
  assert.equal(low.excludeAnomalies, true);
  assert.equal(med.excludeAnomalies, true);
  assert.equal(high.excludeAnomalies, false);
  // DNP floor relaxes as risk rises.
  assert.ok(low.dnpMinNbaRecent10 >= med.dnpMinNbaRecent10);
  assert.ok(med.dnpMinNbaRecent10 >= high.dnpMinNbaRecent10);
});
