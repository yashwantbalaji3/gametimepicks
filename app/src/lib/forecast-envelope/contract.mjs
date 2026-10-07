/**
 * FORECAST ENVELOPE v1 — THE CONTRACT (Architecture slice A-1).
 *
 * One envelope = one forecast GameTimePicks produced for one claim about one event, carrying the lineage a reader
 * needs to trace it backwards:
 *
 *     product → probability → distribution → simulation/model → version → inputs → frozen timestamp
 *
 * WHAT THIS SLICE IS: the schema, a pure validator and a deterministic id. Nothing produces or reads an envelope
 * yet. Producers adopt it one sport per slice (A-5…A-9), additively; boards and Results read it later (B-3, R-1).
 * Until then this file changes no page, no number and no artifact.
 *
 * THE RULES IT ENFORCES (each one is a defect the architecture audit found somewhere in the product):
 *   - PROJECTION IS NOT PROBABILITY. A continuous projection never carries `probability`; a binary claim always does.
 *   - MARKET IS NOT GTP PROBABILITY. A market-implied number is basis MARKET_IMPLIED, with no model, no maturity and
 *     no run count. A model envelope keeps the market in `market.impliedProbability`, never in `probability`.
 *   - THE BASIS IS HONEST. MONTE_CARLO needs a run count and a convergence check (Monte Carlo standard error at that
 *     run count, Part II.C). Every other basis has `runCount: null`: an exact analytic number is never relabelled as a
 *     simulation, and a simulation label never travels without its N (Part II.0 #3).
 *   - PREGAME ONLY. `forecastAt` and `frozenAt` are both before `eventStart`; `frozenAt` is never before `forecastAt`.
 *   - MISSING STAYS MISSING. A field the producer cannot supply is `null`. `inputHash` and `frozenAt` may be null, but
 *     `lineageGaps()` names them, so a gap is reported instead of papered over. Nothing here invents a value.
 *   - A CHAMPION IS {code version, parameter hash, calibration map} (Part II.0 #6). `modelVersion` is required for a
 *     model basis; `paramsHash` and `calibrationId` are carried when the producer has them (E-4 fills the registry).
 *
 * Maturity uses the recorded vocabulary only (Research / Experimental / Established / Paused / Retired). No sixth
 * tier: the evidence meter (E-1) lives beside the envelope, not inside it.
 *
 * Pure: no node:crypto, no fs. The same id is computable in a browser, a build script and a test.
 */
import { fnv1a64 } from "../forecast-ledger/identity.mjs";

export const ENVELOPE_SCHEMA_VERSION = "forecast-envelope@1";

/** How the published number was obtained. */
export const PROBABILITY_BASIS = Object.freeze({
  /** Share of N sampled worlds. Needs runCount + convergence. */
  MONTE_CARLO: "MONTE_CARLO",
  /** Exact from a fitted distribution (logistic, Poisson / Dixon-Coles matrix, softmax). runCount null. */
  ANALYTIC_MODEL: "ANALYTIC_MODEL",
  /** A sportsbook price turned into a probability. Not a GameTimePicks model number. */
  MARKET_IMPLIED: "MARKET_IMPLIED",
  /** A rule or formula that is not a fitted, calibrated model (e.g. a confidence heuristic). */
  HEURISTIC: "HEURISTIC",
  /** An empirical hit rate over a stated history. */
  HIT_RATE: "HIT_RATE",
});
export const PROBABILITY_BASES = Object.freeze(Object.values(PROBABILITY_BASIS));
const MODEL_BASES = Object.freeze(PROBABILITY_BASES.filter((b) => b !== PROBABILITY_BASIS.MARKET_IMPLIED));

/** Same three kinds as the Forecast Ledger, so an envelope maps 1:1 onto a ledger row. */
export const ENVELOPE_KIND = Object.freeze({
  BINARY: "BINARY_PROBABILITY",
  MULTICLASS: "MULTICLASS_PROBABILITY",
  CONTINUOUS: "CONTINUOUS_PROJECTION",
});
export const ENVELOPE_KINDS = Object.freeze(Object.values(ENVELOPE_KIND));

/** The recorded maturity vocabulary (§15, PE Q-decisions). */
export const MATURITY = Object.freeze(["RESEARCH", "EXPERIMENTAL", "ESTABLISHED", "PAUSED", "RETIRED"]);

export const SPORTS = Object.freeze(["NFL", "MLB", "NBA", "EPL", "LIGUE_1", "LALIGA", "SERIE_A", "BUNDESLIGA", "UFC"]);

/** Monte Carlo tolerances from Part II.C: 0.5 pp for a single leg, 0.3 pp for a joint tail. */
export const MC_TOLERANCE = Object.freeze({ SINGLE: 0.005, JOINT: 0.003 });

/** Quantile keys a continuous distribution may carry. */
export const QUANTILE_KEYS = Object.freeze(["p05", "p10", "p25", "p50", "p75", "p90", "p95"]);

/** Every top-level field, in canonical order (serialisation order is part of determinism). */
export const ENVELOPE_FIELDS = Object.freeze([
  "envelopeId", "schemaVersion",
  "sport", "family", "forecastKind",
  "eventId", "eventStart", "subjectId", "claim",
  "probability", "classProbabilities", "distribution",
  "probabilityBasis", "runCount", "convergence",
  "modelId", "modelVersion", "paramsHash", "calibrationId",
  "inputHash", "forecastAt", "frozenAt",
  "maturity",
  "market",
  "lineage",
]);

/** Identity: the claim, not the model. A new model version on the same claim is a revision (lineage.supersedes). */
export const ENVELOPE_IDENTITY_FIELDS = Object.freeze(["sport", "eventId", "subjectId", "family", "forecastKind"]);

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isIso = (v) => typeof v === "string" && Number.isFinite(Date.parse(v));
const isStr = (v) => typeof v === "string" && v.length > 0;
const isProb = (v) => isNum(v) && v >= 0 && v <= 1;
const r6 = (v) => Number(v.toFixed(6));

/** Monte Carlo standard error of a share p estimated from N independent worlds: √(p(1−p)/N). */
export function mcStandardError(p, runCount) {
  if (!isProb(p) || !Number.isInteger(runCount) || runCount < 1) return null;
  return r6(Math.sqrt((p * (1 - p)) / runCount));
}

/**
 * The convergence block a MONTE_CARLO envelope carries. `exactProbability` is the analytic value where one exists
 * (soccer matrix, UFC softmax), so the sampled-vs-exact difference is recorded instead of hidden.
 */
export function convergenceCheck(p, runCount, { tolerance = MC_TOLERANCE.SINGLE, exactProbability = null } = {}) {
  const standardError = mcStandardError(p, runCount);
  if (standardError == null) return null;
  return {
    standardError,
    tolerance,
    withinTolerance: standardError <= tolerance,
    exactProbability: isProb(exactProbability) ? exactProbability : null,
    sampledMinusExact: isProb(exactProbability) ? r6(p - exactProbability) : null,
  };
}

/** The probability the convergence check is about: the binary p, or the class closest to 0.5 (largest MC error). */
function convergenceProbability(env) {
  if (env.forecastKind === ENVELOPE_KIND.BINARY) return env.probability;
  if (env.forecastKind === ENVELOPE_KIND.MULTICLASS && env.classProbabilities) {
    const vs = Object.values(env.classProbabilities).filter(isProb);
    if (!vs.length) return null;
    return vs.reduce((best, v) => (Math.abs(v - 0.5) < Math.abs(best - 0.5) ? v : best));
  }
  return null;
}

export function envelopeIdentityKey(parts) {
  for (const k of ENVELOPE_IDENTITY_FIELDS) {
    const v = parts?.[k];
    if (!isStr(v)) throw new Error(`forecast envelope identity: ${k} is required (got ${JSON.stringify(v)})`);
    if (v.includes("|")) throw new Error(`forecast envelope identity: ${k} may not contain "|"`);
  }
  const c = parts.claim ?? {};
  const line = c.line == null ? "" : String(c.line);
  return [...ENVELOPE_IDENTITY_FIELDS.map((k) => parts[k]), c.market ?? "", c.side ?? "", line].join("|");
}

/** Deterministic id: "fe1-" + FNV-1a-64 over identity + model version + forecastAt (one id per revision). */
export function envelopeId(parts) {
  return `fe1-${fnv1a64(`${envelopeIdentityKey(parts)}#${parts.modelVersion ?? ""}#${parts.forecastAt ?? ""}`)}`;
}

/**
 * Build an envelope with every field present (missing → null) in canonical order, and the id filled in.
 * It does not validate; call validateEnvelope on the result.
 */
export function makeEnvelope(input) {
  const env = {};
  for (const k of ENVELOPE_FIELDS) env[k] = input?.[k] ?? null;
  env.schemaVersion = ENVELOPE_SCHEMA_VERSION;
  env.claim = { market: input?.claim?.market ?? null, side: input?.claim?.side ?? null, line: input?.claim?.line ?? null };
  env.lineage = {
    distributionRef: input?.lineage?.distributionRef ?? null,
    receiptId: input?.lineage?.receiptId ?? null,
    supersedes: input?.lineage?.supersedes ?? null,
  };
  env.envelopeId = envelopeId(env);
  return env;
}

/** Validate one envelope. Returns a list of problems (empty = valid). Pure. */
export function validateEnvelope(env) {
  const p = [];
  if (!env || typeof env !== "object") return ["envelope is not an object"];
  for (const k of ENVELOPE_FIELDS) if (!(k in env)) p.push(`missing field ${k}`);
  for (const k of Object.keys(env)) if (!ENVELOPE_FIELDS.includes(k)) p.push(`unknown field ${k}`);
  if (env.schemaVersion !== ENVELOPE_SCHEMA_VERSION) p.push("schemaVersion");
  if (!SPORTS.includes(env.sport)) p.push(`sport ${env.sport}`);
  for (const k of ["family", "eventId", "subjectId"]) if (!isStr(env[k])) p.push(k);
  if (!ENVELOPE_KINDS.includes(env.forecastKind)) p.push(`forecastKind ${env.forecastKind}`);
  if (!isStr(env.envelopeId) || !/^fe1-[0-9a-f]{16}$/.test(env.envelopeId)) p.push("envelopeId shape");
  else {
    try { if (env.envelopeId !== envelopeId(env)) p.push("envelopeId does not match identity"); } catch { /* reported above */ }
  }

  // The claim: what exactly the probability is about.
  const c = env.claim;
  if (!c || typeof c !== "object") p.push("claim");
  else {
    if (!isStr(c.market)) p.push("claim.market");
    if (c.line != null && !isNum(c.line)) p.push("claim.line is not a number");
  }

  // Kind decides which number is present. Projection is not probability.
  switch (env.forecastKind) {
    case ENVELOPE_KIND.BINARY:
      if (!isProb(env.probability)) p.push("binary envelope without a probability in [0,1]");
      if (env.classProbabilities != null) p.push("binary envelope carries classProbabilities");
      if (env.distribution != null) p.push("binary envelope carries a distribution");
      break;
    case ENVELOPE_KIND.MULTICLASS: {
      if (env.probability != null) p.push("multiclass envelope carries a bare probability");
      if (env.distribution != null) p.push("multiclass envelope carries a distribution");
      const cp = env.classProbabilities;
      if (!cp || typeof cp !== "object" || !Object.keys(cp).length) { p.push("multiclass envelope without classProbabilities"); break; }
      const vs = Object.values(cp);
      if (!vs.every(isProb)) p.push("class probability outside [0,1]");
      else if (Math.abs(vs.reduce((a, b) => a + b, 0) - 1) > 0.02) p.push("class probabilities do not sum to 1");
      break;
    }
    case ENVELOPE_KIND.CONTINUOUS: {
      if (env.probability != null) p.push("continuous projection carries a probability (projection is not probability)");
      if (env.classProbabilities != null) p.push("continuous envelope carries classProbabilities");
      const d = env.distribution;
      if (!d || typeof d !== "object") { p.push("continuous envelope without a distribution"); break; }
      if (!isNum(d.center)) p.push("distribution.center");
      const q = d.quantiles;
      if (q != null) {
        const keys = Object.keys(q);
        if (keys.some((k) => !QUANTILE_KEYS.includes(k))) p.push("unknown quantile key");
        const ordered = QUANTILE_KEYS.filter((k) => k in q).map((k) => q[k]);
        if (!ordered.every(isNum)) p.push("non-numeric quantile");
        else if (ordered.some((v, i) => i > 0 && v < ordered[i - 1])) p.push("quantiles not monotone");
      }
      break;
    }
    default:
      break;
  }

  // Basis honesty.
  if (!PROBABILITY_BASES.includes(env.probabilityBasis)) p.push(`probabilityBasis ${env.probabilityBasis}`);
  if (env.probabilityBasis === PROBABILITY_BASIS.MONTE_CARLO) {
    if (!Number.isInteger(env.runCount) || env.runCount < 1) p.push("MONTE_CARLO without an integer runCount");
    const cp = convergenceProbability(env);
    if (cp != null) {
      const cv = env.convergence;
      if (!cv || typeof cv !== "object") p.push("MONTE_CARLO without a convergence check");
      else {
        const se = mcStandardError(cp, env.runCount);
        if (se == null || !isNum(cv.standardError) || Math.abs(cv.standardError - se) > 1e-6) p.push("convergence.standardError does not match p and runCount");
        if (!isNum(cv.tolerance) || cv.tolerance <= 0) p.push("convergence.tolerance");
        else if (isNum(cv.standardError) && cv.withinTolerance !== (cv.standardError <= cv.tolerance)) p.push("convergence.withinTolerance inconsistent");
      }
    }
  } else if (env.probabilityBasis != null) {
    if (env.runCount != null) p.push(`runCount on a ${env.probabilityBasis} envelope (only MONTE_CARLO has a run count)`);
    if (env.convergence != null) p.push(`convergence on a ${env.probabilityBasis} envelope`);
  }

  // Market is not GTP probability.
  if (env.probabilityBasis === PROBABILITY_BASIS.MARKET_IMPLIED) {
    if (env.modelId != null || env.modelVersion != null) p.push("MARKET_IMPLIED envelope names a model");
    if (env.maturity != null) p.push("MARKET_IMPLIED envelope carries a model maturity");
  } else if (MODEL_BASES.includes(env.probabilityBasis)) {
    if (!isStr(env.modelId)) p.push("modelId");
    if (!isStr(env.modelVersion)) p.push("modelVersion");
    if (!MATURITY.includes(env.maturity)) p.push(`maturity ${env.maturity}`);
  }
  if (env.market != null) {
    if (typeof env.market !== "object") p.push("market");
    else {
      if ("probability" in env.market) p.push("market block carries a bare `probability` (must be impliedProbability)");
      if (env.market.impliedProbability != null && !isProb(env.market.impliedProbability)) p.push("market.impliedProbability outside [0,1]");
      if (env.market.capturedAt != null && !isIso(env.market.capturedAt)) p.push("market.capturedAt");
    }
  }

  // Pregame only.
  if (env.eventStart != null && !isIso(env.eventStart)) p.push("eventStart");
  if (!isIso(env.forecastAt)) p.push("forecastAt");
  if (env.frozenAt != null && !isIso(env.frozenAt)) p.push("frozenAt");
  if (isIso(env.forecastAt) && isIso(env.eventStart) && !(Date.parse(env.forecastAt) < Date.parse(env.eventStart))) p.push("forecastAt is not before eventStart");
  if (isIso(env.frozenAt) && isIso(env.eventStart) && !(Date.parse(env.frozenAt) < Date.parse(env.eventStart))) p.push("frozenAt is not before eventStart");
  if (isIso(env.frozenAt) && isIso(env.forecastAt) && Date.parse(env.frozenAt) < Date.parse(env.forecastAt)) p.push("frozenAt is before forecastAt");

  for (const k of ["inputHash", "paramsHash", "calibrationId"]) if (env[k] != null && !isStr(env[k])) p.push(k);
  const l = env.lineage;
  if (!l || typeof l !== "object") p.push("lineage");
  else if (l.supersedes != null && (!isStr(l.supersedes) || !/^fe1-[0-9a-f]{16}$/.test(l.supersedes))) p.push("lineage.supersedes shape");
  return p;
}

/**
 * Lineage a reader cannot trace yet. Not errors: honest gaps, reported so they get closed instead of filled in.
 * Model envelopes only — a market number has no model lineage to trace.
 */
export function lineageGaps(env) {
  if (!env || env.probabilityBasis === PROBABILITY_BASIS.MARKET_IMPLIED) return [];
  const g = [];
  if (env.inputHash == null) g.push("inputHash");
  if (env.frozenAt == null) g.push("frozenAt");
  if (env.eventStart == null) g.push("eventStart");
  if (env.paramsHash == null) g.push("paramsHash");
  if (env.calibrationId == null) g.push("calibrationId");
  if (env.probabilityBasis === PROBABILITY_BASIS.MONTE_CARLO && env.lineage?.distributionRef == null) g.push("lineage.distributionRef");
  return g;
}
