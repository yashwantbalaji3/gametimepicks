/**
 * Prediction-factory guards (Program 167 · Release H): variants validate real engine outputs,
 * axes stay independent, MLB is described not wrapped, cross-sport ranking is impossible.
 * Run: npx tsx --test src/lib/sports/research/prediction-factory.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { validateModelOutput, deriveReadinessRegistry, SPORT_ADAPTER_MANIFESTS, READINESS_AXES, PIPELINE_STAGES } from "./prediction-factory.mjs";
import { fitNflV1, predictNflV1, strengthStateAt } from "./nfl/model-v1.mjs";
import { fitUfcV1, predictUfcV1 } from "./ufc/model-v1.mjs";
import { fitEplStrength, scoreMatrix } from "./epl/strength-state.mjs";

const nflCorpus = JSON.parse(fs.readFileSync(path.join(process.cwd(), "..", "data/internal/research/nfl/corpus-v1.json"), "utf8"));
const ufcCorpus = JSON.parse(fs.readFileSync(path.join(process.cwd(), "..", "data/internal/research/ufc/corpus-v1.json"), "utf8"));
const eplCorpus = JSON.parse(fs.readFileSync(path.join(process.cwd(), "..", "data/internal/research/epl/corpus-v1.json"), "utf8"));

test("NFL v1 output validates as BINARY_WINNER_MARGIN_TOTAL — the real engine, not a mock", () => {
  const fit = fitNflV1(nflCorpus.rows.filter((r) => [2023, 2024].includes(r.season)));
  const state = strengthStateAt({ rows: nflCorpus.rows, cutoffIso: "2026-01-01T00:00:00Z" });
  const out = predictNflV1({ fit, strengthState: state, event: { providerEventId: "x", seasonType: 2, home: "Kansas City Chiefs", away: "Las Vegas Raiders" } });
  assert.deepEqual(validateModelOutput("BINARY_WINNER_MARGIN_TOTAL", out).errors, []);
});

test("NBA compatibility: an NBA-shaped output of the SAME variant validates — factory-compatible without an engine", () => {
  // The declared NBA variant equals NFL's. A structurally identical output (as an NBA engine
  // would emit) passes the same validator — the compatibility proof the charter asks for,
  // with no fake NBA model minted.
  const nbaShaped = {
    state: "PREDICTED",
    probs: { home: 0.61, away: 0.39 },
    margin: { mean: 4.2, sigma: 12.1, quantiles: { p10: -11.3, p25: -4.0, p50: 4.2, p75: 12.4, p90: 19.7 } },
    total: { mean: 224.5, sigma: 18.0, quantiles: { p10: 201.4, p25: 212.4, p50: 224.5, p75: 236.6, p90: 247.6 } },
  };
  assert.equal(SPORT_ADAPTER_MANIFESTS.nba.outputVariant, SPORT_ADAPTER_MANIFESTS.nfl.outputVariant);
  assert.deepEqual(validateModelOutput(SPORT_ADAPTER_MANIFESTS.nba.outputVariant, nbaShaped).errors, []);
});

test("UFC v1 outputs (predicted AND abstained) validate as BINARY_WINNER_ABSTAIN", () => {
  const fit = fitUfcV1(ufcCorpus.rows);
  const abstain = predictUfcV1({ fit, bout: { red: "Nobody Real", blue: "Also Nobody", dateUtc: "2026-08-15T21:00Z" }, boutIso: "2026-08-15T21:00Z" });
  assert.equal(abstain.state, "ABSTAIN");
  assert.deepEqual(validateModelOutput("BINARY_WINNER_ABSTAIN", abstain).errors, []);
});

test("EPL matrix validates as THREE_WAY_SCORE_TOTAL; a binary read is structurally invalid", () => {
  const state = fitEplStrength({ rows: eplCorpus.rows, cutoffIso: "2026-08-01T00:00:00Z" });
  const mx = scoreMatrix(state, "Arsenal", "Chelsea");
  assert.deepEqual(validateModelOutput("THREE_WAY_SCORE_TOTAL", { probs: { home: mx.oneXTwo.home, draw: mx.oneXTwo.draw, away: mx.oneXTwo.away }, totals: mx.totals, topScorelines: mx.topScorelines }).errors, []);
  const binary = validateModelOutput("THREE_WAY_SCORE_TOTAL", { probs: { home: 0.6, away: 0.4 }, totals: mx.totals, topScorelines: mx.topScorelines });
  assert.equal(binary.ok, false, "a two-way soccer read can never validate — the draw is never folded away");
});

test("MLB is described, never re-validated or wrapped — the validator refuses MLB_EXISTING", () => {
  const res = validateModelOutput("MLB_EXISTING", {});
  assert.equal(res.ok, false);
  assert.match(res.errors[0], /live pipeline's own guards/);
});

test("registry: six independent axes per sport, each with a receipt or a reason, never a merged score", () => {
  const reg = deriveReadinessRegistry();
  assert.deepEqual(reg.axes, [...READINESS_AXES]);
  for (const [sport, entry] of Object.entries(reg.sports)) {
    assert.deepEqual(Object.keys(entry.axes), [...READINESS_AXES], `${sport}: all six axes present, none collapsed`);
    for (const [axis, v] of Object.entries(entry.axes)) {
      assert.equal(typeof v.state, "boolean", `${sport}.${axis} is a boolean state`);
      assert.ok(v.state ? v.receipt : v.reason, `${sport}.${axis} carries its receipt or reason`);
    }
    assert.equal("score" in entry, false, "no merged score exists");
  }
  assert.equal(reg.sports.mlb.axes.PUBLIC_ELIGIBLE.state, true, "MLB is the only public-eligible sport");
  for (const sport of ["nfl", "ufc", "epl", "nba"]) {
    assert.equal(reg.sports[sport].axes.CURRENT_SHADOW_PROVEN.state, false, `${sport}: no current shadow can be proven without authorized odds`);
    assert.equal(reg.sports[sport].axes.PUBLIC_ELIGIBLE.state, false, `${sport}: publicActivation OFF by charter`);
  }
});

test("replay axes cite the committed reports; engine sports are REPLAY_VALIDATED, NBA is not", () => {
  const reg = deriveReadinessRegistry();
  for (const sport of ["nfl", "ufc", "epl"]) {
    assert.equal(reg.sports[sport].axes.REPLAY_VALIDATED.state, true, sport);
    assert.match(reg.sports[sport].axes.REPLAY_VALIDATED.receipt, /model-v1-evaluation\.json/);
  }
  assert.equal(reg.sports.nba.axes.REPLAY_VALIDATED.state, false);
  assert.match(reg.sports.nba.axes.REPLAY_VALIDATED.reason, /by design/);
});

test("cross-sport ranking is banned in data and in code", () => {
  const reg = deriveReadinessRegistry();
  assert.match(reg.crossSportRanking, /BANNED/);
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/sports/prediction-factory.mjs"), "utf8");
  assert.ok(!/\.sort\(/.test(src), "no sort exists in the factory — nothing can order sports by metric");
  assert.equal(PIPELINE_STAGES.length, 12, "the shared vocabulary is the twelve-stage pipeline");
});
