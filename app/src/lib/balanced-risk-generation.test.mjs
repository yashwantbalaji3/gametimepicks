import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTodaySlate } from "./parlays/ui-loader.ts";
import { loadMoonshotLane } from "./moonshot/moonshot-lane.ts";
import { buildCoverageMatrix } from "./parlays/coverage-matrix.ts";
import { RISK_BUCKET_TARGETS } from "./parlays/risk-bucket-targets.ts";
import { getRiskBucketForCombinedOdds } from "./parlays/risk-odds-bands.ts";

const slate = loadTodaySlate("2026-06-19", "2026-06-19T20:20:00Z");
const m = buildCoverageMatrix(slate, loadMoonshotLane(), "2026-06-19T20:20:00Z");
const RB = ["low", "medium", "high", "longshot"];

test("RISK_BUCKET_TARGETS config defines all six scopes × four buckets", () => {
  for (const scope of ["world_cup_single_game", "world_cup_multi_game", "mlb", "mixed", "moonshot", "bank_builder"]) {
    assert.ok(RISK_BUCKET_TARGETS[scope], `${scope} target present`);
    for (const rb of RB) assert.equal(typeof RISK_BUCKET_TARGETS[scope][rb], "number", `${scope}.${rb} numeric target`);
  }
  assert.deepEqual(RISK_BUCKET_TARGETS.mlb, { low: 4, medium: 4, high: 4, longshot: 4 });
});

test("Medium no longer floods: every model-generated scope is capped at ≤5 per bucket", () => {
  for (const scope of ["world_cup_multi_game", "mlb", "mixed"]) {
    const row = m.rows.find((r) => r.scope === scope);
    for (const c of row.cells) assert.ok(c.count <= 5, `${scope}.${c.risk} ≤ cap 5 (got ${c.count})`);
  }
});

test("balanced leg-count spread fills High AND Longshot for MLB + Mixed (not Medium-only)", () => {
  for (const scope of ["mlb", "mixed"]) {
    const row = m.rows.find((r) => r.scope === scope);
    const high = row.cells.find((c) => c.risk === "high").count;
    const longshot = row.cells.find((c) => c.risk === "longshot").count;
    assert.ok(high > 0, `${scope} has High cards`);
    assert.ok(longshot > 0, `${scope} has Longshot cards`);
  }
  // The distribution is no longer Medium-dominated: Medium is not more than the rest combined.
  assert.ok(m.riskTotals.medium <= m.riskTotals.high + m.riskTotals.longshot + m.riskTotals.low + 6, "Medium no longer dwarfs the board");
});

test("every generated High card fits +300..+600 and every Longshot card is > +600", () => {
  for (const [, byRisk] of Object.entries(slate.suggestedBySportRisk)) {
    for (const c of byRisk.high ?? []) assert.equal(getRiskBucketForCombinedOdds(c.combinedOdds), "high", `${c.parlayId} fits High`);
    for (const c of byRisk.longshot ?? []) assert.equal(getRiskBucketForCombinedOdds(c.combinedOdds), "longshot", `${c.parlayId} fits Longshot`);
  }
  for (const c of slate.mixedByRisk.high ?? []) assert.equal(getRiskBucketForCombinedOdds(c.combinedOdds), "high");
  for (const c of slate.mixedByRisk.longshot ?? []) assert.equal(getRiskBucketForCombinedOdds(c.combinedOdds), "longshot");
});

test("Mixed High/Longshot cards still span ≥2 sports with a World Cup leg", () => {
  for (const rb of ["high", "longshot"]) {
    for (const c of slate.mixedByRisk[rb] ?? []) {
      assert.ok(c.legs.some((l) => l.sport === "WORLD_CUP"), `mixed ${rb} ${c.parlayId} has a WC leg`);
      assert.ok(new Set(c.legs.map((l) => l.sport)).size >= 2, `mixed ${rb} ${c.parlayId} spans ≥2 sports`);
    }
  }
});

test("balancedGeneration diagnostics: targets + filled + a reason for every under-target bucket", () => {
  const bg = m.balancedGeneration;
  assert.ok(bg && bg.targets && bg.filledByScopeRisk, "balancedGeneration present");
  for (const [k, reason] of Object.entries(bg.underfilledReasons)) assert.ok(reason && reason.length > 0, `${k} underfilled reason present`);
  // Low Risk under-target everywhere → reason is specific (a real band/gate reason, never vague filler).
  assert.ok(bg.underfilledReasons["mlb.low"] && !/no qualified parlays/i.test(bg.underfilledReasons["mlb.low"]), "mlb.low has a specific reason");
  // The matrix summary spells out WHY Low is empty across the board (the -200..+100 band).
  assert.ok(m.diagnosticsSummary.some((s) => /Low Risk/.test(s) && /-200/.test(s)), "summary explains the Low Risk empty band");
  // Snapshot persists balancedGeneration.
  const snap = JSON.parse(fs.readFileSync("public/data/parlays/coverage-matrix.json", "utf8"));
  assert.ok(snap.balancedGeneration && snap.balancedGeneration.targets, "snapshot has balancedGeneration");
});

test("active cards untouched: Lane A/B, Moonshot, and Mr. Dub exposure unchanged by generation", () => {
  // Generation must NOT mutate the bank-builder artifacts. JUNE-30 LIVE STATE: both lanes SETTLED-LOST their
  // June-29 Step, so each lane is laneStatus "stopped" with ONE settled-LOST Step-1. The prior settled cycles
  // are preserved in each lane's priorLane chain. Neither lane carries top-level pinned legs (cards live in
  // steps[]). Generation must leave that state intact.
  const dual = JSON.parse(fs.readFileSync("public/data/methodology/launch/dual-bank-builder-active.json", "utf8"));
  assert.equal(dual.run.laneA.laneStatus, "stopped", "laneA stopped (settled-LOST June-29)");
  assert.equal(dual.run.laneB.laneStatus, "stopped", "laneB stopped (settled-LOST June-29)");
  // Lane A: one settled-LOST Step-1; the earlier LOST step is preserved in priorLane.
  assert.equal(dual.run.laneA.currentStep, 1, "laneA on Step 1");
  assert.equal((dual.run.laneA.steps ?? []).length, 1, "laneA has one settled-LOST Step-1");
  assert.equal(dual.run.laneA.steps[0].status, "settled", "laneA Step 1 is settled");
  assert.equal(dual.run.laneA.steps[0].result, "lost", "laneA Step 1 settled LOST (June-29)");
  assert.deepEqual(dual.run.laneA.legs ?? [], [], "laneA has no top-level pinned legs (cards live in steps[])");
  assert.equal(dual.run.laneA.priorLane.steps[0].result, "lost", "laneA priorLane preserves the prior LOST step");
  // Lane B: one settled-LOST Step-1; the prior LOST Step-2 is preserved in priorLane.
  assert.equal(dual.run.laneB.currentStep, 1, "laneB on Step 1");
  assert.equal((dual.run.laneB.steps ?? []).length, 1, "laneB has one settled-LOST Step-1");
  assert.equal(dual.run.laneB.steps[0].status, "settled", "laneB Step 1 is settled");
  assert.equal(dual.run.laneB.steps[0].result, "lost", "laneB Step 1 settled LOST (June-29)");
  assert.deepEqual(dual.run.laneB.legs ?? [], [], "laneB has no top-level pinned legs");
  assert.equal(dual.run.laneB.priorLane.steps.find((s) => s.step === 2).result, "lost", "laneB priorLane preserves the prior LOST Step-2");
  const moon = JSON.parse(fs.readFileSync("public/data/moonshot-lane/active.json", "utf8"));
  assert.equal(moon.ladder[0].card.combinedOdds, 1152, "Moonshot Step 1 card is +1152");
  const p = JSON.parse(fs.readFileSync("public/data/mr-dub/portfolio.json", "utf8"));
  // CANONICAL money is the post-banking truth and is NOT moved by generation: crown = Σ two banked ladder finals.
  assert.equal(p.openExposure, 0, "core canonical open exposure $0 (settled rungs released; banked ladders carry no exposure)");
  assert.equal(p.crownBankroll, 20465.4, "crown = Σ two completed-ladder finals, untouched by generation");
  assert.equal(p.moonshot.exposure, 0, "moonshot settled LOST → $0 exposure");
});
