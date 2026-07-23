/**
 * NBA REBOUNDS first-market prototype contract tests (Phase 13). Deterministic, no clock, no network, NO model.
 * Pins the feature schema, settlement, four baselines, simulation-input contract, completeness criteria, the strict
 * chronological evaluation plan, and — critically — that readiness stays INSUFFICIENT while no leakage-safe historical
 * rows provably exist. Run: npx tsx --test src/lib/nba/rebounds-prototype-contract.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  REB_FEATURE_SCHEMA,
  REB_SETTLEMENT_CONTRACT,
  gradeRebound,
  REB_BASELINES,
  noVigOverProbability,
  REB_SIMULATION_INPUT_CONTRACT,
  REB_COMPLETENESS_CRITERIA,
  isReboundsRowComplete,
  REB_EVALUATION_PLAN,
  reboundsPrototypeReadiness,
  REB_PROTOTYPE_EVIDENCE,
  NBA_CONTRACT_FLAGS,
  REB_MARKET,
} from "./rebounds-prototype-contract.ts";

test("feature schema · trailing-form keys mirror build_features.py and are all pregame; gaps flagged", () => {
  const keys = REB_FEATURE_SCHEMA.map((f) => f.key);
  for (const k of ["last5_reb", "last10_reb", "season_reb", "dispersion_reb", "minutes_trend", "games_played_window"]) {
    assert.ok(keys.includes(k), `missing ${k}`);
  }
  // Every schema feature is pregame-timed (no postgame inputs).
  for (const f of REB_FEATURE_SCHEMA) assert.match(f.timing, /^pregame_/);
  // expected_minutes + opponent adjustment are the enumerated MISSING reactivation gaps.
  assert.equal(REB_FEATURE_SCHEMA.find((f) => f.key === "expected_minutes").presentInHistorical, false);
  assert.equal(REB_FEATURE_SCHEMA.find((f) => f.key === "opponent_reb_allowed").presentInHistorical, false);
});

test("settlement · REB is a single unambiguous counting stat, post-game, with a push rule", () => {
  assert.equal(REB_SETTLEMENT_CONTRACT.market, REB_MARKET);
  assert.equal(REB_SETTLEMENT_CONTRACT.settleable, true);
  assert.equal(REB_SETTLEMENT_CONTRACT.boxScoreField, "REB");
  assert.equal(REB_SETTLEMENT_CONTRACT.direction, "postgame");
  assert.equal(gradeRebound(11, 8.5, "Over"), "win");
  assert.equal(gradeRebound(6, 8.5, "Over"), "loss");
  assert.equal(gradeRebound(9, 8.5, "Under"), "loss");
  assert.equal(gradeRebound(8, 8, "Over"), "push", "final == line is a push");
});

test("baselines · four baselines incl. the market de-vig bar; de-vig matches the real board impliedProbability", () => {
  const ids = REB_BASELINES.map((b) => b.id);
  assert.deepEqual(ids, ["market_devig", "rolling_avg", "minutes_adjusted", "opponent_adjusted"]);
  // Real lean odds -132 / +100 → 0.5323, matching board.impliedProbability 0.532258.
  assert.ok(Math.abs(noVigOverProbability(-132, 100) - 0.532258) < 0.001, "de-vig over prob ~0.5323");
  // Symmetric -110/-110 de-vigs to 0.5.
  assert.ok(Math.abs(noVigOverProbability(-110, -110) - 0.5) < 1e-9);
  // The market de-vig is the baseline the model must beat, and it is reconstructable today.
  const mkt = REB_BASELINES.find((b) => b.id === "market_devig");
  assert.equal(mkt.reconstructableToday, true);
  // Minutes / opponent baselines need fields the pipeline lacks today.
  assert.equal(REB_BASELINES.find((b) => b.id === "minutes_adjusted").reconstructableToday, false);
});

test("simulation-input contract · normal model inputs; no simulation is executed here", () => {
  assert.equal(REB_SIMULATION_INPUT_CONTRACT.model, "normal");
  assert.equal(REB_SIMULATION_INPUT_CONTRACT.sigmaFloor, 3.0);
  assert.equal(REB_SIMULATION_INPUT_CONTRACT.runCount, 10000);
  assert.deepEqual(REB_SIMULATION_INPUT_CONTRACT.requiredInputs, ["projection", "sigma", "line", "side"]);
});

test("completeness · a row is complete only when EVERY leakage-safe criterion holds", () => {
  assert.equal(REB_COMPLETENESS_CRITERIA.requiresProvenIsoTipoff, true);
  const good = isReboundsRowComplete({ priorGames: 8, hasMarketLine: true, provenIsoTipoff: true, pregameSnapshotEligible: true, decisiveSettlement: true });
  assert.equal(good.complete, true);
  // The historical reality: everything present EXCEPT a proven ISO tip-off ⇒ incomplete.
  const noTip = isReboundsRowComplete({ priorGames: 8, hasMarketLine: true, provenIsoTipoff: false, pregameSnapshotEligible: false, decisiveSettlement: true });
  assert.equal(noTip.complete, false);
  assert.ok(noTip.missing.includes("provenIsoTipoff"));
  const thin = isReboundsRowComplete({ priorGames: 2, hasMarketLine: true, provenIsoTipoff: true, pregameSnapshotEligible: true, decisiveSettlement: true });
  assert.equal(thin.complete, false);
  assert.ok(thin.missing.some((m) => m.startsWith("priorGames")));
});

test("evaluation plan · strict chronological, calibration refit on TRAIN only, beat market on BOTH metrics", () => {
  assert.equal(REB_EVALUATION_PLAN.splitType, "strict_chronological");
  assert.equal(REB_EVALUATION_PLAN.calibrationRefitScope, "train_only");
  assert.equal(REB_EVALUATION_PLAN.mustBeatBaseline, "market_devig");
  assert.deepEqual(REB_EVALUATION_PLAN.mustBeatMetrics, ["brier", "logloss"]);
  assert.equal(REB_EVALUATION_PLAN.mustBeCalibrated, true);
  assert.equal(REB_EVALUATION_PLAN.founderReviewRequired, true);
  assert.equal(REB_EVALUATION_PLAN.minBacktestSample, 800);
});

test("readiness · INSUFFICIENT with the real evidence (0 fully-eligible dates, no proven ISO tip-off)", () => {
  assert.equal(REB_PROTOTYPE_EVIDENCE.decisiveRebRows, 1212, "REB has many decisive rows");
  assert.equal(REB_PROTOTYPE_EVIDENCE.fullyResearchEligibleDates, 0, "but zero are fully research-eligible");
  const r = reboundsPrototypeReadiness();
  assert.equal(r.status, "INSUFFICIENT");
  assert.ok(r.blockers.some((b) => /proven ISO tip-off/.test(b)));
  assert.ok(r.blockers.some((b) => /fully-research-eligible dates/.test(b)));
  // Sanity: the gate CAN flip once (hypothetically) proven-eligible rows exist above the sample floor.
  const hypothetical = reboundsPrototypeReadiness({ decisiveRebRows: 1212, fullyResearchEligibleDates: 25, fullyResearchEligibleRebObs: 900, holdoutDecisiveReb: 900, provenIsoTipoffDates: 25 });
  assert.equal(hypothetical.status, "READY_FOR_FIT");
});

test("contract flags · HISTORICAL_ONLY, approves no modeling/exposure", () => {
  assert.equal(NBA_CONTRACT_FLAGS.public, false);
  assert.equal(NBA_CONTRACT_FLAGS.approvedForProduction, false);
  assert.equal(NBA_CONTRACT_FLAGS.productEligible, false);
});
