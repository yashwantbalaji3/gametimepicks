/**
 * A-1 — Forecast Envelope v1. The contract refuses the defects the architecture audit found: a projection passed off
 * as a probability, a market number passed off as ours, a simulation label without its N, an analytic number
 * relabelled as a simulation, and a "pregame" forecast stamped after the start.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeEnvelope, validateEnvelope, lineageGaps, envelopeId, convergenceCheck, mcStandardError,
  ENVELOPE_FIELDS, ENVELOPE_KIND, PROBABILITY_BASIS, MC_TOLERANCE, MATURITY,
} from "./contract.mjs";

const base = (over = {}) => ({
  sport: "NFL",
  family: "nfl_game_winner",
  forecastKind: ENVELOPE_KIND.BINARY,
  eventId: "401872980",
  eventStart: "2026-10-12T17:00:00Z",
  subjectId: "nfl-401872980",
  claim: { market: "winner", side: "HOME", line: null },
  probability: 0.6421,
  probabilityBasis: PROBABILITY_BASIS.MONTE_CARLO,
  runCount: 10000,
  convergence: convergenceCheck(0.6421, 10000),
  modelId: "nfl-sim-v2",
  modelVersion: "2.0.0",
  paramsHash: "a1b2c3d4",
  calibrationId: "nfl-winner-platt@1",
  inputHash: "9f8e7d6c",
  forecastAt: "2026-10-11T12:00:00Z",
  frozenAt: "2026-10-12T15:00:00Z",
  maturity: "EXPERIMENTAL",
  market: { impliedProbability: 0.61, devigged: true, provider: "consensus", capturedAt: "2026-10-11T11:00:00Z" },
  lineage: { distributionRef: "data/internal/nfl/sim-v2/2026-10-12.json#401872980", receiptId: "r-1", supersedes: null },
  ...over,
});

test("a complete Monte Carlo envelope validates, with every field present in canonical order", () => {
  const env = makeEnvelope(base());
  assert.deepEqual(validateEnvelope(env), []);
  assert.deepEqual(Object.keys(env), ENVELOPE_FIELDS);
  assert.match(env.envelopeId, /^fe1-[0-9a-f]{16}$/);
  assert.deepEqual(lineageGaps(env), []);
});

test("the id is deterministic and changes with a revision, not with display data", () => {
  const a = makeEnvelope(base());
  const b = makeEnvelope(base({ market: null, probability: 0.65, convergence: convergenceCheck(0.65, 10000) }));
  assert.equal(a.envelopeId, b.envelopeId, "same claim, same version, same forecastAt = same id");
  const rev = makeEnvelope(base({ forecastAt: "2026-10-12T09:00:00Z", lineage: { supersedes: a.envelopeId } }));
  assert.notEqual(rev.envelopeId, a.envelopeId);
  assert.deepEqual(validateEnvelope(rev), []);
  const otherLine = makeEnvelope(base({ claim: { market: "total", side: "OVER", line: 44.5 } }));
  assert.notEqual(otherLine.envelopeId, a.envelopeId);
});

test("a tampered id is refused", () => {
  const env = makeEnvelope(base());
  env.probability = 0.7;
  env.convergence = convergenceCheck(0.7, 10000);
  assert.deepEqual(validateEnvelope(env), []);
  env.eventId = "401872981";
  assert.ok(validateEnvelope(env).includes("envelopeId does not match identity"));
});

test("projection is not probability: a continuous envelope with a probability is refused", () => {
  const env = makeEnvelope(base({
    family: "player_reception_yds", forecastKind: ENVELOPE_KIND.CONTINUOUS, subjectId: "nfl-athlete-1",
    claim: { market: "reception_yds" }, probability: 0.55, runCount: 10000, convergence: null,
    distribution: { center: 61.2, quantiles: { p10: 22, p50: 58, p90: 104 } },
  }));
  assert.ok(validateEnvelope(env).some((x) => x.startsWith("continuous projection carries a probability")));
  env.probability = null;
  env.envelopeId = envelopeId(env);
  assert.deepEqual(validateEnvelope(env), []);
});

test("quantiles must be monotone", () => {
  const env = makeEnvelope(base({
    family: "nfl_game_total", forecastKind: ENVELOPE_KIND.CONTINUOUS, probability: null, convergence: null,
    probabilityBasis: PROBABILITY_BASIS.ANALYTIC_MODEL, runCount: null,
    distribution: { center: 44, quantiles: { p10: 50, p90: 38 } },
  }));
  assert.ok(validateEnvelope(env).includes("quantiles not monotone"));
});

test("market is not GTP probability: a market-implied envelope names no model, no maturity, no run count", () => {
  const ok = makeEnvelope(base({
    probabilityBasis: PROBABILITY_BASIS.MARKET_IMPLIED, runCount: null, convergence: null,
    modelId: null, modelVersion: null, paramsHash: null, calibrationId: null, maturity: null, inputHash: null,
  }));
  assert.deepEqual(validateEnvelope(ok), []);
  assert.deepEqual(lineageGaps(ok), [], "a market number has no model lineage to report");
  const dressedUp = makeEnvelope(base({ probabilityBasis: PROBABILITY_BASIS.MARKET_IMPLIED, runCount: null, convergence: null }));
  const problems = validateEnvelope(dressedUp);
  assert.ok(problems.includes("MARKET_IMPLIED envelope names a model"));
  assert.ok(problems.includes("MARKET_IMPLIED envelope carries a model maturity"));
});

test("a market block may not carry a bare probability", () => {
  const env = makeEnvelope(base({ market: { probability: 0.6 } }));
  assert.ok(validateEnvelope(env).some((x) => x.startsWith("market block carries a bare")));
});

test("Monte Carlo needs N and a matching convergence check; other bases may not carry N", () => {
  const noN = makeEnvelope(base({ runCount: null }));
  assert.ok(validateEnvelope(noN).includes("MONTE_CARLO without an integer runCount"));
  const noCheck = makeEnvelope(base({ convergence: null }));
  assert.ok(validateEnvelope(noCheck).includes("MONTE_CARLO without a convergence check"));
  const wrongSe = makeEnvelope(base({ convergence: { ...convergenceCheck(0.6421, 10000), standardError: 0.001 } }));
  assert.ok(validateEnvelope(wrongSe).includes("convergence.standardError does not match p and runCount"));
  const analyticWithN = makeEnvelope(base({ probabilityBasis: PROBABILITY_BASIS.ANALYTIC_MODEL }));
  const problems = validateEnvelope(analyticWithN);
  assert.ok(problems.some((x) => x.startsWith("runCount on a ANALYTIC_MODEL")));
  assert.ok(problems.some((x) => x.startsWith("convergence on a ANALYTIC_MODEL")));
});

test("convergence: 10,000 runs at p = 0.5 is 0.5 pp; joint tails use the tighter tolerance", () => {
  assert.equal(mcStandardError(0.5, 10000), 0.005);
  assert.equal(convergenceCheck(0.5, 10000).withinTolerance, true);
  assert.equal(convergenceCheck(0.5, 5000).withinTolerance, false);
  const joint = convergenceCheck(0.08, 10000, { tolerance: MC_TOLERANCE.JOINT });
  assert.equal(joint.standardError, 0.002713);
  assert.equal(joint.withinTolerance, true);
  const vsExact = convergenceCheck(0.4512, 10000, { exactProbability: 0.4487 });
  assert.equal(vsExact.sampledMinusExact, 0.0025);
  assert.equal(mcStandardError(0.5, 0), null);
});

test("multiclass: probabilities must sum to 1; MC error is checked on the class nearest 0.5", () => {
  const cp = { home: 0.47, draw: 0.26, away: 0.27 };
  const env = makeEnvelope(base({
    sport: "EPL", family: "epl_1x2", forecastKind: ENVELOPE_KIND.MULTICLASS, probability: null,
    classProbabilities: cp, claim: { market: "1x2" }, convergence: convergenceCheck(0.47, 10000),
  }));
  assert.deepEqual(validateEnvelope(env), []);
  const bad = makeEnvelope(base({
    sport: "EPL", family: "epl_1x2", forecastKind: ENVELOPE_KIND.MULTICLASS, probability: null,
    classProbabilities: { home: 0.6, draw: 0.3, away: 0.3 }, claim: { market: "1x2" }, convergence: convergenceCheck(0.6, 10000),
  }));
  assert.ok(validateEnvelope(bad).includes("class probabilities do not sum to 1"));
});

test("pregame only: forecastAt and frozenAt before the start, frozenAt not before forecastAt", () => {
  const late = makeEnvelope(base({ forecastAt: "2026-10-12T17:00:00Z", frozenAt: null }));
  assert.ok(validateEnvelope(late).includes("forecastAt is not before eventStart"));
  const lateFreeze = makeEnvelope(base({ frozenAt: "2026-10-12T17:30:00Z" }));
  assert.ok(validateEnvelope(lateFreeze).includes("frozenAt is not before eventStart"));
  const backwards = makeEnvelope(base({ frozenAt: "2026-10-10T00:00:00Z" }));
  assert.ok(validateEnvelope(backwards).includes("frozenAt is before forecastAt"));
});

test("a model envelope needs a model id, a version and a recorded maturity word", () => {
  const env = makeEnvelope(base({ modelVersion: null, maturity: "EARLY" }));
  const problems = validateEnvelope(env);
  assert.ok(problems.includes("modelVersion"));
  assert.ok(problems.includes("maturity EARLY"));
  assert.deepEqual(MATURITY, ["RESEARCH", "EXPERIMENTAL", "ESTABLISHED", "PAUSED", "RETIRED"]);
});

test("missing stays missing: null lineage is allowed but reported as a gap, never filled in", () => {
  const env = makeEnvelope(base({ inputHash: null, frozenAt: null, paramsHash: null, calibrationId: null, lineage: {} }));
  assert.deepEqual(validateEnvelope(env), []);
  assert.deepEqual(lineageGaps(env), ["inputHash", "frozenAt", "paramsHash", "calibrationId", "lineage.distributionRef"]);
  assert.equal(env.inputHash, null);
});

test("unknown fields and a bad supersedes pointer are refused", () => {
  const env = makeEnvelope(base({ lineage: { supersedes: "not-an-id" } }));
  env.confidence = 0.9;
  const problems = validateEnvelope(env);
  assert.ok(problems.includes("unknown field confidence"));
  assert.ok(problems.includes("lineage.supersedes shape"));
});
