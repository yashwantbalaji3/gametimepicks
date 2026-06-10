import { test } from "node:test";
import assert from "node:assert/strict";
import { toPublicBankBuilderView } from "./data-bank-builder.ts";

const summary = {
  generatedAt: "2026-06-10T15:45:00+00:00", startingBankrollUnits: 100, currentBankrollUnits: 211.85,
  goalUnits: 3000, currentRunProfitUnits: 111.85, currentRunRoiPct: 111.9,
  record: { wins: 3, losses: 7, pushes: 0 }, settledPickCount: 10, currentProgressionStep: 2,
  currentStreak: 1, lastSettledDate: "2026-06-09", lastSettledResult: "win",
  nextEligibleDate: null, nextPickStatus: "pending generation", nextPick: null,
};
const entry = {
  date: "2026-06-09", sport: "mlb", slipId: "slip_x", result: "win", combinedAmerican: 112,
  stakeUnits: 100, bankrollBefore: 100, bankrollAfter: 211.85, progressionStepBefore: 1, progressionStepAfter: 2,
  legs: [{ player: "Shohei Ohtani", market: "batter_hits", side: "Over", line: 0.5, finalStat: 1, result: "win" },
         { player: "Corey Seager", market: "batter_hits", side: "Under", line: 1.5, finalStat: 1, result: "win" }],
  settlementSource: "mlb_stats_api", audit: { officialResultConfirmed: true, allLegsResolved: true, noTargetGameLeakage: true },
};

test("public view exposes current run KPIs", () => {
  const v = toPublicBankBuilderView(summary, entry);
  assert.equal(v.currentRun.currentBankroll, 211.85);
  assert.equal(v.currentRun.currentStep, 2);
  assert.equal(v.currentRun.streak, "W1");
  assert.equal(v.currentRun.lastSettledResult, "win");
});

test("lifetime record is hidden from hero (but preserved honestly)", () => {
  const v = toPublicBankBuilderView(summary, entry);
  assert.equal(v.lifetimeAudit.hiddenFromHero, true);
  assert.equal(v.lifetimeAudit.record, "3-7"); // preserved for audit, not led with
});

test("last settled slip shows June 9 win with both legs + finalStat", () => {
  const v = toPublicBankBuilderView(summary, entry);
  assert.equal(v.lastSettledSlip.result, "win");
  assert.equal(v.lastSettledSlip.paperProfit, 111.85);
  assert.equal(v.lastSettledSlip.legs.length, 2);
  assert.equal(v.lastSettledSlip.legs[0].name, "Shohei Ohtani");
  assert.equal(v.lastSettledSlip.legs[0].finalStat, 1);
});

test("next slip pending when no nextPick", () => {
  const v = toPublicBankBuilderView(summary, entry);
  assert.equal(v.nextSlip.status, "pending");
});

test("null summary → null view (fail-closed)", () => {
  assert.equal(toPublicBankBuilderView(null, null), null);
});
