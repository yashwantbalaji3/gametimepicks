import { test } from "node:test";
import assert from "node:assert/strict";
import {
  UFC_CURRENT_GATES,
  UFC_SCHEDULE_ONLY_COPY,
  UFC_SUPPORTED_MARKETS,
  ufcPublicLevel,
  ufcCanShowSchedule,
  ufcCanPublishProjections,
  ufcCanPublishParlays,
  ufcMarketSupported,
} from "./ufc-types.ts";

test("UFC is fail-closed today: schedule only, no projections, no parlays", () => {
  assert.equal(ufcPublicLevel(UFC_CURRENT_GATES), "schedule-only");
  assert.equal(ufcCanShowSchedule(UFC_CURRENT_GATES), true);
  assert.equal(ufcCanPublishProjections(UFC_CURRENT_GATES), false);
  assert.equal(ufcCanPublishParlays(UFC_CURRENT_GATES), false);
});

test("odds alone (no fighter stats) stays INTERNAL — never a public winner pick", () => {
  const g = { ...UFC_CURRENT_GATES, hasOdds: true };
  assert.equal(ufcPublicLevel(g), "odds-internal");
  assert.equal(ufcCanPublishProjections(g), false);
  assert.equal(ufcCanPublishParlays(g), false);
});

test("projections require grading; parlays require grading AND backtest", () => {
  const withStats = { hasSchedule: true, hasOdds: true, hasFighterStats: true, hasResultsGrading: false, hasBacktest: false };
  assert.equal(ufcPublicLevel(withStats), "projections-internal");
  assert.equal(ufcCanPublishProjections(withStats), false);

  const withGrading = { ...withStats, hasResultsGrading: true, hasBacktest: false };
  assert.equal(ufcCanPublishParlays(withGrading), false); // backtest still missing

  const allGates = { hasSchedule: true, hasOdds: true, hasFighterStats: true, hasResultsGrading: true, hasBacktest: true };
  assert.equal(ufcPublicLevel(allGates), "parlays-public");
  assert.equal(ufcCanPublishProjections(allGates), true);
  assert.equal(ufcCanPublishParlays(allGates), true);
});

test("no schedule or no odds → schedule-only regardless of other flags", () => {
  const noSchedule = { hasSchedule: false, hasOdds: true, hasFighterStats: true, hasResultsGrading: true, hasBacktest: true };
  assert.equal(ufcPublicLevel(noSchedule), "schedule-only");
  const noOdds = { ...noSchedule, hasSchedule: true, hasOdds: false };
  assert.equal(ufcPublicLevel(noOdds), "schedule-only");
});

test("only the four defined markets are supported; unknown markets excluded", () => {
  assert.deepEqual([...UFC_SUPPORTED_MARKETS].sort(), ["goes_distance", "method", "rounds_total", "winner"]);
  assert.equal(ufcMarketSupported("winner"), true);
  assert.equal(ufcMarketSupported("anytime_finish"), false);
  assert.equal(ufcMarketSupported(""), false);
});

test("schedule-only copy is compliant (no picks, no banned terms)", () => {
  const all = Object.values(UFC_SCHEDULE_ONLY_COPY).join(" ").toLowerCase();
  for (const banned of ["lock", "guaranteed", "guarantee", "risk-free", "sure thing", "safe", "safest", "edge", "v2", "new model", "shadow", "best bet"]) {
    assert.ok(!all.includes(banned), `schedule-only copy must not contain "${banned}"`);
  }
});
