/**
 * UI loader contract — the loader turns the engine into display data WITHOUT fabricating cards,
 * mutating protected data, or ever launching Bank Builder. Runs from app/ so process.cwd()/public
 * resolves to the committed board JSON.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTodaySlate } from "./ui-loader.ts";

test("missing/unknown date yields an honest empty state (no crash, no fabrication)", () => {
  const v = loadTodaySlate("1999-01-01");
  assert.equal(v.available, false);
  assert.equal(v.allSuggested.length, 0);
  assert.equal(v.eligibleLegs.length, 0);
  assert.equal(v.bankBuilderPreview.status, "no_qualified_launch");
  assert.notEqual(v.bankBuilderPreview.status, "launched");
});

test("real slate normalizes MLB parlays with identity attached", () => {
  const v = loadTodaySlate("2026-06-17", "2026-06-17T18:45:45Z");
  assert.equal(v.available, true);
  const mlb = v.sports.find((s) => s.sport === "MLB");
  assert.ok(mlb && mlb.eligibleCount > 0, "MLB has eligible legs");
  const mlbCards = v.allSuggested.filter((c) => c.sport === "MLB");
  assert.ok(mlbCards.length > 0, "MLB suggested cards exist");
  const leg = mlbCards[0].legs[0];
  assert.ok(leg.participant.length > 0);
  assert.ok(leg.identity, "leg carries an identity object");
  // Cards only contain eligible (not No Bet) legs.
  for (const c of v.allSuggested) for (const l of c.legs) assert.notEqual(l.confidenceTier, "No Bet");
});

test("no fabricated cards for sports with no eligible candidates", () => {
  const v = loadTodaySlate("2026-06-17", "2026-06-17T18:45:45Z");
  for (const s of v.sports) {
    if (s.eligibleCount === 0) {
      assert.ok(s.noQualified, `${s.sport} has an honest no-qualified reason`);
      assert.equal(Object.values(s.suggestedByRisk).reduce((a, b) => a + b, 0), 0, `${s.sport} has zero suggested cards`);
      assert.equal(v.allSuggested.filter((c) => c.sport === s.sport).length, 0);
    }
  }
});

test("a date with no launched artifact shows an operator-gated preview (not active)", () => {
  // 1999 has no slate and no launched run → never active, never a launched run id.
  const v = loadTodaySlate("1999-01-01", "1999-01-01T12:00:00Z");
  assert.notEqual(v.bankBuilderPreview.status, "launched");
  assert.equal(v.bankBuilderPreview.runId, null);
});

test("the launched 06-17 run is soccer-per-lane from the engine namespace", () => {
  const v = loadTodaySlate("2026-06-17", "2026-06-17T21:30:00Z");
  const bb = v.bankBuilderPreview;
  if (bb.status === "launched") {
    // Active run carries a run id and one World Cup leg in EACH lane.
    assert.ok(bb.runId, "launched run has a run id");
    assert.ok(bb.laneA && bb.laneB, "both lanes present");
    assert.ok(bb.laneA.legs.some((l) => l.sport === "WORLD_CUP"), "Lane A has a World Cup leg");
    assert.ok(bb.laneB.legs.some((l) => l.sport === "WORLD_CUP"), "Lane B has a World Cup leg");
    // No shared leg across lanes.
    const aIds = new Set(bb.laneA.legs.map((l) => l.legId));
    assert.ok(bb.laneB.legs.every((l) => !aIds.has(l.legId)), "no shared legs");
    // The exact Over/Under side is available on the MLB strikeout legs (clickable "why" data).
    const allLegs = [...bb.laneA.legs, ...bb.laneB.legs];
    const mlbLeg = allLegs.find((l) => l.sport === "MLB");
    if (mlbLeg) {
      assert.ok(mlbLeg.side === "over" || mlbLeg.side === "under", "MLB leg carries an exact side");
      assert.ok(Array.isArray(mlbLeg.topPositiveFactors), "leg carries why-factors for the drawer");
    }
  }
});

test("a settled run surfaces official lane + leg results", () => {
  const v = loadTodaySlate("2026-06-17", "2026-06-18T05:00:00Z");
  const bb = v.bankBuilderPreview;
  if (bb.status === "settled") {
    // Lanes carry an official result + advance flag.
    assert.ok(bb.laneA.result && bb.laneB.result, "both lanes carry a settlement result");
    for (const lane of [bb.laneA, bb.laneB]) {
      assert.equal(typeof lane.advanced, "boolean");
      // Every leg has an official result + an official stat/score line (never fabricated).
      for (const leg of lane.legs) {
        assert.ok(["won", "lost", "void", "pending", "needs_review"].includes(leg.settlementResult), `leg result is a real status: ${leg.settlementResult}`);
        assert.ok(leg.settlementOfficial && leg.settlementOfficial.length > 0, "leg carries an official source line");
      }
    }
  }
});

test("identity never invents a photo URL for sports without one", () => {
  const v = loadTodaySlate("2026-06-17", "2026-06-17T18:45:45Z");
  for (const c of v.allSuggested) {
    for (const l of c.legs) {
      if (l.sport === "MLB" || l.sport === "UFC" || l.sport === "NBA") {
        assert.equal(l.identity.photoUrl, null, `${l.sport} identity must not fabricate a photoUrl`);
      }
    }
  }
});

test("repeated loads are stable (pure read, memoized)", () => {
  const a = loadTodaySlate("2026-06-17", "2026-06-17T18:45:45Z");
  const b = loadTodaySlate("2026-06-17", "2026-06-17T18:45:45Z");
  assert.equal(a.allSuggested.length, b.allSuggested.length);
  assert.equal(a.bankBuilderPreview.status, b.bankBuilderPreview.status);
});
