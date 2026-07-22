/**
 * MLB SIMULATION FOUNDATION — guards (2026-07-22).
 *
 * Pins the simulation ARCHITECTURE (no models): SimulationFeatureContract coverage helpers, the benchmark metric
 * framework, the batter_vs_pitcher + plate_appearance_opportunity families, per-observation featureCoverage, and
 * the readiness monitor's "modeling BLOCKED" guarantee. NO prediction / NO probability is produced anywhere here.
 *
 * Run: npx tsx --test src/lib/mlb-simulation-foundation-guards.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { featureCoverageOf, coverageScore, SIMULATION_CONTRACT_GUARDRAILS } from "./mlb/simulation/simulation-feature-contract.ts";
import { brierScore, logLoss, accuracy, roiSim, calibrationBins, BASELINES, BENCHMARK_GATE } from "./mlb/simulation/benchmark.ts";
import { PA_BY_SLOT } from "../../scripts/capture-mlb-pregame-pa-opportunity.mjs";
import { buildObservation } from "../../scripts/build-mlb-research-observations.mjs";

const app = process.cwd();
const repo = path.dirname(app);
const FEAT = path.join(repo, "data/internal/mlb/pregame-archive/pregame-features");
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

test("1 · benchmark metrics are correct (Brier / log loss / accuracy)", () => {
  const perfect = [{ p: 1, outcome: 1 }, { p: 0, outcome: 0 }];
  assert.equal(brierScore(perfect), 0);
  assert.ok(logLoss(perfect) < 0.001);
  assert.equal(accuracy(perfect), 1);
  const coin = [{ p: 0.5, outcome: 1 }, { p: 0.5, outcome: 0 }];
  assert.equal(brierScore(coin), 0.25);
  assert.equal(brierScore([]), null, "empty ⇒ null (never fabricates a score)");
});

test("2 · roiSim only bets when model prob beats break-even; calibration bins group by predicted prob", () => {
  // decimalOdds 2.0 ⇒ break-even 0.5; bet only the pModel>0.5 rows
  const r = roiSim([{ pModel: 0.6, decimalOdds: 2.0, outcome: 1 }, { pModel: 0.4, decimalOdds: 2.0, outcome: 1 }]);
  assert.equal(r.bets, 1, "only one qualifying bet");
  assert.equal(r.units, 1, "won 1 unit at +100");
  const bins = calibrationBins([{ p: 0.05, outcome: 0 }, { p: 0.95, outcome: 1 }], 10);
  assert.equal(bins.length, 2);
});

test("3 · SimulationFeatureContract: coverage helper + NO-prediction guardrails", () => {
  const cov = featureCoverageOf({ model_inputs_available: { hasPitcherWorkload: true, hasLineup: false, hasDeVigMarketProbability: true }, pregame_features: { environment: {} } });
  assert.equal(cov.pitcherWorkload, true);
  assert.equal(cov.lineup, false);
  assert.equal(cov.market, true);
  assert.equal(cov.environment, true);
  assert.ok(coverageScore(cov) > 0 && coverageScore(cov) <= 1);
  // the contract must NEVER declare itself a model / prediction source
  assert.equal(SIMULATION_CONTRACT_GUARDRAILS.producesPredictions, false);
  assert.equal(SIMULATION_CONTRACT_GUARDRAILS.producesProbabilities, false);
  assert.equal(SIMULATION_CONTRACT_GUARDRAILS.public, false);
  assert.equal(BENCHMARK_GATE.minSettledEligibleObs, 500);
  assert.equal(BASELINES.find((b) => b.key === "market_devig") != null, true);
});

test("4 · buildObservation attaches batter_vs_pitcher/pa_opportunity by playerId + emits featureCoverage", () => {
  const join = { gamePk: 1, eventStartTime: "2026-07-22T23:00:00Z", sourceSnapshotIds: [], officialSource: { endpoint: "s" }, gameFinalStatus: { isFinal: true, detailedState: "Final" }, teamOutcome: {} };
  const row = { market: "batter_hits", gamePk: 1, playerId: 99, player: "B", selection: "Over", line: 1.5, researchEligible: true, noVigProbability: 0.5, capturedAt: "t", actual: 2, settlementStatus: "win", countsAsSettledEligible: true };
  const pf = { feats: {}, eligibleFamilies: ["pitcher_status", "environment"] };
  const features = {
    vsPitcher: { researchEligible: true, playerId: 99, opposingStarter: { id: 1 }, headToHead: { pa: 20 }, sufficientSample: true },
    paOpp: { researchEligible: true, playerId: 99, battingOrderSlot: 3, projectedPA: 4.45, historicalPaPerGame: 4.1 },
  };
  const obs = buildObservation("2026-07-22", join, {}, row, pf, features);
  assert.ok(obs.pregame_features.batter_vs_pitcher, "vsPitcher attached for matching player");
  assert.ok(obs.pregame_features.plate_appearance_opportunity, "pa opportunity attached");
  assert.equal(obs.model_inputs_available.hasBatterVsPitcher, true);
  assert.ok(obs.featureCoverage, "featureCoverage present");
  assert.equal(obs.featureCoverage.batterVsPitcher, true);
  assert.ok(obs.coverageScore > 0 && obs.coverageScore <= 1);
  // wrong player ⇒ not attached
  const mm = buildObservation("2026-07-22", join, {}, { ...row, playerId: 5 }, pf, features);
  assert.equal(mm.pregame_features.batter_vs_pitcher, undefined);
});

test("5 · PA_BY_SLOT is a documented reference (descending); on-disk new families leakage-safe + sample-gated", () => {
  assert.ok(PA_BY_SLOT[1] > PA_BY_SLOT[9], "leadoff gets more PA than the 9-hole");
  for (const fam of ["batter-vs-pitcher", "pa-opportunity"]) {
    const base = path.join(FEAT, fam);
    if (!fs.existsSync(base)) continue;
    for (const d of fs.readdirSync(base).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))) {
      for (const f of fs.readdirSync(path.join(base, d)).filter((x) => x.endsWith(".json"))) {
        const r = readJson(path.join(base, d, f));
        assert.ok(r.capturedAt, `${fam} timestamped`);
        if (r.researchEligible) assert.ok(r.capturedAt < r.eventStartTime, `${fam} captured pregame`);
        if (fam === "batter-vs-pitcher") assert.ok("sufficientSample" in r, "sample-size gate present");
      }
    }
  }
});

test("6 · readiness monitor keeps modeling BLOCKED; artifacts internal; money md5 unchanged", () => {
  const rd = readJson(path.join(repo, "data/internal/mlb/pregame-archive/status/simulation-readiness.json"));
  if (rd) {
    assert.equal(rd.public, false);
    assert.match(rd.modelingStatus, /BLOCKED/);
    assert.equal(rd.gate.met, false, "gate not met (0/500)");
  }
  const out = path.join(app, "out");
  if (fs.existsSync(out)) {
    const hit = fs.readdirSync(out, { recursive: true }).filter((p) => /simulation-feature-contract|batter-vs-pitcher|simulation-readiness/.test(String(p)));
    assert.equal(hit.length, 0);
  }
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});
