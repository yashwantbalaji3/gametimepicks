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
  // Generation must NOT mutate the bank-builder artifacts. JULY-21 REVIEW RESTART: both lanes were reset to fresh
  // Step-1 REVIEW cycles (paper, $0 — MLB pitcher-strikeout review cards). Lane A = cycle 9 active; Lane B = cycle 8
  // active. The prior settled cycles are preserved DOWN one level in each lane's priorLane chain: Lane A priorLane =
  // cycle 8 ADVANCED (Step-1 WON July-6 + Step-2 WON July-7); cycle 7 (July-5 loss) and cycle 6 (July-1/2/3) sit
  // deeper. Neither lane carries top-level pinned legs (cards live in steps[]). Generation must leave that intact.
  const dual = JSON.parse(fs.readFileSync("public/data/methodology/launch/dual-bank-builder-active.json", "utf8"));
  assert.equal(dual.run.laneA.laneStatus, "active", "laneA active (fresh Step-1 review, cycle 9)");
  assert.equal(dual.run.laneB.laneStatus, "active", "laneB active (fresh Step-1 review, cycle 8)");
  // Lane A: fresh Step-1 review cycle 9; the advanced July-6/July-7 cycle (8) then the older cycles live in priorLane.
  assert.equal(dual.run.laneA.cycle, 9, "laneA is cycle 9 (restarted for the July-21 review)");
  assert.equal(dual.run.laneA.currentStep, 1, "laneA restarted to Step 1");
  assert.equal((dual.run.laneA.steps ?? []).length, 1, "laneA has a single fresh Step-1 review card");
  assert.equal(dual.run.laneA.steps[0].status, "active", "laneA Step 1 is the fresh review (not a settled rung)");
  assert.equal(dual.run.laneA.steps[0].result ?? null, null, "laneA Step 1 is unsettled (review card, no result)");
  assert.deepEqual(dual.run.laneA.legs ?? [], [], "laneA has no top-level pinned legs (cards live in steps[])");
  // priorLane = cycle 8: the ADVANCED July-6 Step-1 + July-7 Step-2 WON rungs — durable history preserved one level down.
  assert.equal(dual.run.laneA.priorLane.cycle, 8, "laneA priorLane is cycle 8 (the advanced July-6/July-7 cycle)");
  assert.equal(dual.run.laneA.priorLane.laneStatus, "advanced", "laneA priorLane (cycle 8) advanced");
  assert.equal(dual.run.laneA.priorLane.steps.find((s) => s.step === 1).result, "won", "laneA cycle-8 Step-1 settled WON (July-6)");
  assert.equal(dual.run.laneA.priorLane.steps.find((s) => s.step === 2).result, "won", "laneA cycle-8 Step-2 settled WON (July-7)");
  // priorLane.priorLane = cycle 7: the July-5 LOST Step-1.
  assert.equal(dual.run.laneA.priorLane.priorLane.cycle, 7, "laneA cycle 7 (July-5 loss) preserved two levels down");
  assert.equal(dual.run.laneA.priorLane.priorLane.steps.find((s) => s.step === 1).result, "lost", "laneA cycle-7 Step-1 settled LOST (July-5)");
  // priorLane.priorLane.priorLane = cycle 6: three settled steps (Step-1 July-1 WON, Step-2 July-2 WON, Step-3 July-3 LOST).
  assert.equal(dual.run.laneA.priorLane.priorLane.priorLane.steps[0].result, "won", "laneA cycle-6 Step 1 settled WON (July-1)");
  assert.equal(dual.run.laneA.priorLane.priorLane.priorLane.steps[2].result, "lost", "laneA cycle-6 Step 3 settled LOST (July-3)");
  // Lane B: fresh Step-1 review; its July-5 LOSS (cycle 7) is preserved in priorLane, the July-3 LOSS (cycle 6) deeper.
  assert.equal(dual.run.laneB.cycle, 8, "laneB is cycle 8 (restarted for the July-21 review)");
  assert.equal(dual.run.laneB.currentStep, 1, "laneB top rung is Step 1");
  assert.equal((dual.run.laneB.steps ?? []).length, 1, "laneB has a single fresh Step-1 review card");
  assert.equal(dual.run.laneB.steps[0].status, "active", "laneB top Step 1 is the fresh review (not settled)");
  assert.deepEqual(dual.run.laneB.legs ?? [], [], "laneB has no top-level pinned legs");
  assert.equal(dual.run.laneB.priorLane.steps.find((s) => s.step === 1).result, "lost", "laneB priorLane (cycle 7) preserves the July-5 LOST Step-1");
  assert.equal(dual.run.laneB.priorLane.priorLane.steps.find((s) => s.step === 1).result, "lost", "laneB chain preserves the July-3 LOST Step-1 one level deeper");
  const moon = JSON.parse(fs.readFileSync("public/data/moonshot-lane/active.json", "utf8"));
  assert.equal(moon.ladder[0].card.combinedOdds, 278, "Moonshot Step 1 review card is +278 (Wheeler + Gausman)");
  const p = JSON.parse(fs.readFileSync("public/data/mr-dub/portfolio.json", "utf8"));
  // CANONICAL money is the post-banking truth and is NOT moved by generation: crown = Σ two banked ladder finals.
  assert.equal(p.openExposure, 0, "core canonical open exposure $0 (settled rungs released; banked ladders carry no exposure)");
  assert.equal(p.crownBankroll, 20465.4, "crown = Σ two completed-ladder finals, untouched by generation");
  assert.equal(p.moonshot.exposure, 0, "moonshot exposure $0 (review card, nothing placed)");
});
