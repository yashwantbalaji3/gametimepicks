/**
 * NBA first-market prototype contract — REBOUNDS (Phase 13). CONTRACTS ONLY: schemas, baselines, and an evaluation
 * plan for the single most defensible first market to re-validate. There is NO model here — nothing computes a
 * probability, nothing is surfaced, nothing touches money. NBA is HISTORICAL_ONLY (docs/NBA_ENGINE_FORENSIC_AUDIT.md).
 *
 * Why REB first (grounded in status/nba-first-market-recommendation.json, which was derived from the 4,592 settled
 * rows): of the seven prop families the pipeline produced, only REB / PTS / AST ever settled decisively (3PM / PRA /
 * STL / BLK graded 100% invalid). Among the three, REB is the ONLY one above a coin flip (hit 0.5454 on 1,212
 * decisive) and the closest to the de-vig market on Brier (gap +0.0069, near parity). Rebounds are the least
 * ambiguous counting stat to settle. REB is therefore the shortest credible path from "not market-proven" to
 * "beats the de-vig market" — but it is a REBUILD candidate, not an edge (even REB is still slightly worse than the
 * market and systematically overconfident today).
 *
 * STATUS: INSUFFICIENT. A prototype may not proceed to fitting until leakage-safe historical rows PROVABLY exist —
 * and today zero historical dates are fully research-eligible (no board stores a proven ISO tip-off, so
 * capturedAt < tipoff is unprovable; see status/nba-historical-date-census.json). Pure + deterministic.
 */

/** HISTORICAL_ONLY. This contract approves no modeling and no exposure. */
export const NBA_CONTRACT_FLAGS = { public: false, approvedForProduction: false, productEligible: false } as const;
export const NBA_REBOUNDS_PROTOTYPE_VERSION = "nba-rebounds-prototype-contract-1";
export const REB_MARKET = "REB" as const;

/* ────────────────────────────── 1. FEATURE SCHEMA ────────────────────────────── */

export type FeatureTiming = "pregame_strictly_prior" | "pregame_market_snapshot" | "pregame_manual";

export interface RebFeatureSpec {
  key: string;
  /** Source module in the historical pipeline (empty = a reactivation must add it). */
  source: string;
  timing: FeatureTiming;
  /** Null/fallback behaviour when the input is absent — never imputed from postgame data. */
  fallback: string;
  presentInHistorical: boolean;
}

/**
 * The deterministic REB feature schema. Trailing-form keys mirror pipeline/build_features.py exactly (rebounds
 * variants), all built ONLY from games strictly earlier than the slate. Opponent-adjustment + expected-minutes are
 * enumerated but MISSING in the historical pipeline (reactivation gaps).
 */
export const REB_FEATURE_SCHEMA: ReadonlyArray<RebFeatureSpec> = [
  { key: "last5_reb", source: "pipeline/build_features.py", timing: "pregame_strictly_prior", fallback: "0.0 (empty features)", presentInHistorical: true },
  { key: "last10_reb", source: "pipeline/build_features.py", timing: "pregame_strictly_prior", fallback: "0.0", presentInHistorical: true },
  { key: "season_reb", source: "pipeline/build_features.py", timing: "pregame_strictly_prior", fallback: "0.0", presentInHistorical: true },
  { key: "home_reb", source: "pipeline/build_features.py", timing: "pregame_strictly_prior", fallback: "base season avg", presentInHistorical: true },
  { key: "away_reb", source: "pipeline/build_features.py", timing: "pregame_strictly_prior", fallback: "base season avg", presentInHistorical: true },
  { key: "minutes_trend", source: "pipeline/build_features.py", timing: "pregame_strictly_prior", fallback: "0.0 if <3 games", presentInHistorical: true },
  { key: "games_played_window", source: "pipeline/build_features.py", timing: "pregame_strictly_prior", fallback: "0.0", presentInHistorical: true },
  { key: "dispersion_reb", source: "pipeline/build_features.py (std, floor 3.0)", timing: "pregame_strictly_prior", fallback: "floor 3.0", presentInHistorical: true },
  { key: "expected_minutes", source: "", timing: "pregame_strictly_prior", fallback: "MISSING — must be added; do not impute", presentInHistorical: false },
  { key: "opponent_reb_allowed", source: "", timing: "pregame_strictly_prior", fallback: "MISSING — opponent-adjustment not modeled historically", presentInHistorical: false },
  { key: "market_line_reb", source: "the_odds_api (generate_daily_board.py)", timing: "pregame_market_snapshot", fallback: "row excluded if no line", presentInHistorical: true },
];

/* ────────────────────────────── 2. SETTLEMENT CONTRACT ────────────────────────────── */

export interface RebSettlementContract {
  market: typeof REB_MARKET;
  boxScoreField: string;
  settleable: boolean;
  /** Grade direction: post-game only. */
  direction: "postgame";
  pushRule: string;
  sources: string[];
  note: string;
}

/** REB settlement is unambiguous: a single official rebounds counting stat, already SUPPORTED in settle_results.py. */
export const REB_SETTLEMENT_CONTRACT: RebSettlementContract = {
  market: REB_MARKET,
  boxScoreField: "REB",
  settleable: true, // settle_results.py SUPPORTED_MARKETS = ("PTS","REB","AST"); REB is decisive on 1,212 rows
  direction: "postgame",
  pushRule: "finalStat == line ⇒ push (excluded from decisive)",
  sources: ["espn_summary (primary, ~94%)", "nba_api_boxscore (repair, ~6%)"],
  note: "Single counting stat → cleanest join + zero invalid rows historically (invalid=0 of 1,230 REB rows).",
};

/** Grade a REB leg deterministically from an official rebounds total. Post-game only; never used pregame. */
export function gradeRebound(finalRebounds: number, line: number, side: "Over" | "Under"): "win" | "loss" | "push" {
  if (finalRebounds === line) return "push";
  const over = finalRebounds > line;
  return (side === "Over") === over ? "win" : "loss";
}

/* ────────────────────────────── 3. BASELINE CONTRACT ────────────────────────────── */

export type RebBaselineId = "market_devig" | "rolling_avg" | "minutes_adjusted" | "opponent_adjusted";

export interface RebBaselineSpec {
  id: RebBaselineId;
  description: string;
  requires: string[];
  reconstructableToday: boolean;
}

/** The four baselines a re-validated REB model is measured against. The market de-vig is the bar it must beat. */
export const REB_BASELINES: ReadonlyArray<RebBaselineSpec> = [
  { id: "market_devig", description: "no-vig sportsbook Over probability from oddsOver/oddsUnder — THE baseline to beat", requires: ["oddsOver", "oddsUnder"], reconstructableToday: true },
  { id: "rolling_avg", description: "naive Over prob from the player's rolling REB average vs the line", requires: ["last10_reb", "dispersion_reb", "line"], reconstructableToday: true },
  { id: "minutes_adjusted", description: "per-minute REB rate × expected minutes → projection vs line", requires: ["season_reb", "season_min", "expected_minutes"], reconstructableToday: false },
  { id: "opponent_adjusted", description: "player REB rate scaled by opponent rebounds-allowed factor", requires: ["season_reb", "opponent_reb_allowed"], reconstructableToday: false },
];

const americanToImplied = (odds: number): number => (odds < 0 ? -odds / (-odds + 100) : 100 / (odds + 100));

/**
 * De-vig (no-vig) Over probability from American odds — the reconstructable market baseline. Deterministic + pure.
 * Grounded: for the real lean oddsOver -132 / oddsUnder +100 this returns ~0.5323, matching the board's stored
 * impliedProbability 0.532258 (app/public/data/boards/2026-06-13.json).
 */
export function noVigOverProbability(oddsOver: number, oddsUnder: number): number {
  const io = americanToImplied(oddsOver);
  const iu = americanToImplied(oddsUnder);
  const denom = io + iu;
  return denom > 0 ? io / denom : NaN;
}

/* ────────────────────────────── 4. SIMULATION-INPUT CONTRACT ────────────────────────────── */

export interface RebSimulationInputContract {
  model: "normal";
  meanFrom: string;
  sigmaFrom: string;
  sigmaFloor: number;
  runCount: number;
  requiredInputs: string[];
  note: string;
}

/** The INPUT shape a REB simulation would consume (mirrors the historical normal model). No simulation runs here. */
export const REB_SIMULATION_INPUT_CONTRACT: RebSimulationInputContract = {
  model: "normal",
  meanFrom: "REB projection (weighted last5/last10/season, minutes-adjusted once expected_minutes exists)",
  sigmaFrom: "dispersion_reb (population std of last-10 REB)",
  sigmaFloor: 3.0, // pipeline/build_features.py dispersion_reb floor
  runCount: 10000, // GTP simulator RUN_COUNT
  requiredInputs: ["projection", "sigma", "line", "side"],
  note: "P(Over) = 1 - Φ((line - projection)/sigma). Inputs must all be pregame + leakage-eligible before any run.",
};

/* ────────────────────────────── 5. COMPLETENESS CRITERIA ────────────────────────────── */

export interface RebCompletenessCriteria {
  minPriorGames: number;
  requiresMarketLine: boolean;
  requiresProvenIsoTipoff: boolean;
  requiresEligiblePregameSnapshot: boolean;
  requiresDecisiveSettlement: boolean;
}

export const REB_COMPLETENESS_CRITERIA: RebCompletenessCriteria = {
  minPriorGames: 5, // enough trailing REB games for a stable last-5
  requiresMarketLine: true,
  requiresProvenIsoTipoff: true, // the gap that fails EVERY historical row today
  requiresEligiblePregameSnapshot: true,
  requiresDecisiveSettlement: true,
};

export interface RebRowCompletenessInput {
  priorGames: number;
  hasMarketLine: boolean;
  provenIsoTipoff: boolean;
  pregameSnapshotEligible: boolean;
  decisiveSettlement: boolean;
}

export interface RebRowCompletenessResult {
  complete: boolean;
  missing: string[];
}

/** A REB training/eval row is complete ONLY when every leakage-safe criterion holds. Deterministic. */
export function isReboundsRowComplete(x: RebRowCompletenessInput, c: RebCompletenessCriteria = REB_COMPLETENESS_CRITERIA): RebRowCompletenessResult {
  const missing: string[] = [];
  if (x.priorGames < c.minPriorGames) missing.push(`priorGames<${c.minPriorGames}`);
  if (c.requiresMarketLine && !x.hasMarketLine) missing.push("marketLine");
  if (c.requiresProvenIsoTipoff && !x.provenIsoTipoff) missing.push("provenIsoTipoff");
  if (c.requiresEligiblePregameSnapshot && !x.pregameSnapshotEligible) missing.push("eligiblePregameSnapshot");
  if (c.requiresDecisiveSettlement && !x.decisiveSettlement) missing.push("decisiveSettlement");
  return { complete: missing.length === 0, missing };
}

/* ────────────────────────────── 6. CHRONOLOGICAL EVALUATION PLAN ────────────────────────────── */

export interface RebEvaluationPlan {
  splitType: "strict_chronological";
  calibrationRefitScope: "train_only";
  trainRange: string;
  testRange: string;
  mustBeatBaseline: RebBaselineId;
  mustBeatMetrics: string[];
  mustBeCalibrated: boolean;
  minBacktestSample: number;
  minSlateDates: number;
  founderReviewRequired: boolean;
}

/** Grounded in status/nba-first-market-recommendation.json + nba-historical-backfill-feasibility.json (Path A). */
export const REB_EVALUATION_PLAN: RebEvaluationPlan = {
  splitType: "strict_chronological",
  calibrationRefitScope: "train_only", // reusing the historical window as OOS leaks calibration
  trainRange: "2026-05-15..2026-05-30 (12 dates; ~674 decisive REB)",
  testRange: "2026-06-03..2026-06-13 (4 dates; ~538 decisive REB)",
  mustBeatBaseline: "market_devig",
  mustBeatMetrics: ["brier", "logloss"], // BOTH, plus a calibration curve
  mustBeCalibrated: true,
  minBacktestSample: 800, // REB holdout 538 is below this → enlarge before any claim
  minSlateDates: 25,
  founderReviewRequired: true,
};

/* ────────────────────────────── 7. READINESS (STATUS = INSUFFICIENT) ────────────────────────────── */

export type RebPrototypeStatus = "INSUFFICIENT" | "READY_FOR_FIT";

export interface RebPrototypeEvidence {
  decisiveRebRows: number;
  fullyResearchEligibleDates: number;
  fullyResearchEligibleRebObs: number;
  holdoutDecisiveReb: number;
  provenIsoTipoffDates: number;
}

/**
 * Real historical evidence (derived from app/public/data/results/settled_leans.jsonl + the board census). REB has
 * plenty of DECISIVE rows, but ZERO fully-research-eligible dates because no board stores a proven ISO tip-off.
 */
export const REB_PROTOTYPE_EVIDENCE: RebPrototypeEvidence = {
  decisiveRebRows: 1212,
  fullyResearchEligibleDates: 0, // no proven ISO tip-off on ANY historical board
  fullyResearchEligibleRebObs: 0,
  holdoutDecisiveReb: 538,
  provenIsoTipoffDates: 0,
};

export interface RebReadinessResult {
  status: RebPrototypeStatus;
  blockers: string[];
}

/**
 * A prototype is READY_FOR_FIT only when leakage-safe historical REB rows PROVABLY exist AND the holdout meets the
 * minimum sample. With the real evidence this returns INSUFFICIENT — the status stays INSUFFICIENT until an ISO
 * tip-off is recorded and the census yields fully-eligible rows.
 */
export function reboundsPrototypeReadiness(
  e: RebPrototypeEvidence = REB_PROTOTYPE_EVIDENCE,
  plan: RebEvaluationPlan = REB_EVALUATION_PLAN,
): RebReadinessResult {
  const blockers: string[] = [];
  if (e.provenIsoTipoffDates === 0) blockers.push("no historical board records a proven ISO tip-off (capturedAt<tipoff unprovable)");
  if (e.fullyResearchEligibleDates === 0) blockers.push("zero fully-research-eligible dates in the census");
  if (e.fullyResearchEligibleRebObs < plan.minBacktestSample) blockers.push(`fully-eligible REB obs ${e.fullyResearchEligibleRebObs} < ${plan.minBacktestSample}`);
  if (e.holdoutDecisiveReb < plan.minBacktestSample) blockers.push(`holdout REB ${e.holdoutDecisiveReb} < min ${plan.minBacktestSample}`);
  return { status: blockers.length === 0 ? "READY_FOR_FIT" : "INSUFFICIENT", blockers };
}
