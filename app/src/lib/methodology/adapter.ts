/**
 * Methodology adapter — wires the leakage-safe methodology framework into the REAL prediction
 * pipeline. The Python models write board JSON (the raw, already-computed model inputs:
 * projection, sigma, odds, recent form). This adapter maps each board lean into the canonical
 * `PredictionOutput` by:
 *
 *   1. building `PredictionSnapshotMetadata` + leakage-safe rolling windows from the board,
 *   2. running `validateLeakage()` BEFORE a prediction is accepted,
 *   3. using ONLY `implemented` registry features as live scoring inputs (planned/not_available
 *      are excluded from scoring and surfaced as missing/planned context),
 *   4. computing confidence via `computeConfidence()` and risk via `computeRisk()`,
 *   5. emitting the canonical `PredictionOutput` (confidence, risk, missing/stale/sample flags,
 *      top positive/negative factors, leakage pass/fail).
 *
 * It NEVER fabricates a feature the board does not carry, never publishes a slate, and never
 * touches Bank Builder. Pure: no fs / no fetch / no Date.now — fully unit-testable.
 */
import type {
  Sport,
  ModelMode,
  PredictionOutput,
  PredictionSnapshotMetadata,
  TopFactor,
  MissingDataFlag,
  StaleDataFlag,
  SmallSampleFlag,
  LeakageValidationResult,
  RollingWindowMeta,
  ImplementationStatus,
} from "./types";
import { validateLeakage } from "./validation";
import { computeConfidence, type ConfidenceComponents } from "./confidence";
import { computeRisk, type RiskInputs } from "./risk";
import { sampleSizeBucket, sampleWeight, smallSampleFlag } from "./global-rules";
import { staleFlag, FRESHNESS_THRESHOLDS } from "./data-quality";
import { registryFor } from "./sport-feature-groups";
// Relative (not @/) import so this module + its tests run unchanged under tsx; projection-framework
// is pure and import-free.
import {
  noVigTwoWay,
  americanToImpliedRaw,
  clampProb,
  edgePoints,
  dataQualityTier,
  type DataQualityGrade,
} from "../projection-framework";

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

// ── Permissive board shapes (read-only over Python-generated JSON) ───────────────────────────────
export interface BoardMeta {
  date?: string;
  generatedFor?: string;
  generatedAt?: string;
  oddsSource?: string;
  scheduleSource?: string;
  [k: string]: unknown;
}
export interface MlbBoardLean {
  id?: string;
  gameId?: string;
  gamePk?: number;
  commenceTime?: string | null;
  playerName?: string;
  playerRole?: string; // "pitcher" | "batter"
  playerTeamAbbr?: string;
  marketKey?: string;
  marketLabel?: string;
  line?: number | null;
  oddsOver?: number | null;
  oddsUnder?: number | null;
  projection?: number | null;
  sigma?: number | null;
  samples?: number | null;
  recentSeries?: number[];
  recentGames?: Array<{ date?: string; value?: number; isHome?: boolean; opponent?: string }>;
  lean?: string; // "Over" | "Under"
  modelProbOver?: number | null;
  modelProbUnder?: number | null;
  edgePct?: number | null;
  riskFlags?: string[];
  bookmaker?: string;
  /** Optional explicit capture times; when the pipeline records them, freshness uses them. */
  marketSnapshotTime?: string | null;
  lineupSnapshotTime?: string | null;
  [k: string]: unknown;
}

export interface MethodologyOptions {
  /** market_aware_model (default) uses odds for market-implied + edge; no_market_model drops them. */
  marketAware: boolean;
}
export const DEFAULT_OPTIONS: MethodologyOptions = { marketAware: true };

export interface AdaptedPrediction {
  output: PredictionOutput;
  snapshot: PredictionSnapshotMetadata;
  leakage: LeakageValidationResult;
  rollingWindows: RollingWindowMeta[];
}

export interface MethodologyRunResult {
  sport: Sport;
  boardDate: string | null;
  predictionTime: string | null;
  modelMode: ModelMode;
  /** predictions that passed validateLeakage() — the only ones a downstream step may use. */
  accepted: AdaptedPrediction[];
  /** predictions dropped by the leakage gate (kept for transparency, never published). */
  rejectedByLeakage: AdaptedPrediction[];
}

// ── Registry-driven feature gating ───────────────────────────────────────────────────────────────

/** Live scoring inputs = ONLY features whose status is "implemented". */
export function liveFeatures(sport: Sport) {
  return registryFor(sport).features.filter((f) => f.status === "implemented");
}
export function liveFeatureNames(sport: Sport): string[] {
  return liveFeatures(sport).map((f) => f.name);
}

/** True only for features we genuinely compute — planned/partial/not_available are never live. */
export function isLiveInput(sport: Sport, featureName: string): boolean {
  const f = registryFor(sport).features.find((x) => x.name === featureName);
  return !!f && f.status === "implemented";
}

/**
 * Features that are DEFINED but not live (planned / not_available) — surfaced as missing/planned
 * context so a prediction never looks more complete than it is. `critical` only if the registry
 * marks the feature required (so a non-required planned feed never forces No Bet on its own).
 */
export function surfacedContextFlags(sport: Sport): MissingDataFlag[] {
  const surfaced: ImplementationStatus[] = ["planned", "not_available"];
  return registryFor(sport)
    .features.filter((f) => surfaced.includes(f.status))
    .map((f) => ({
      field: f.name,
      critical: f.required,
      reason: `${f.status}: defined in registry but not a live input`,
    }));
}

// ── Snapshot metadata + rolling windows ──────────────────────────────────────────────────────────

/**
 * Build per-prediction snapshot metadata from the board. The board fetches odds + game logs during
 * generation, so `generatedAt` is the prediction time and the de-facto market/feature snapshot time.
 * A batter without a confirmed lineup gets a null lineup snapshot (→ missing flag), never a guess.
 */
export function buildMlbSnapshot(lean: MlbBoardLean, board: BoardMeta): PredictionSnapshotMetadata {
  const predictionTime = String(board.generatedAt ?? "");
  const eventStartTime = String(lean.commenceTime ?? "");
  const isPitcher = (lean.playerRole ?? "").toLowerCase() === "pitcher";
  const hasOdds = lean.oddsOver != null || lean.oddsUnder != null;
  // Prefer an explicitly-recorded capture time; else the odds/lineup were resolved at generation.
  const explicitMarket = typeof lean.marketSnapshotTime === "string" ? lean.marketSnapshotTime : null;
  const explicitLineup = typeof lean.lineupSnapshotTime === "string" ? lean.lineupSnapshotTime : null;
  return {
    eventId: String(lean.gameId ?? lean.gamePk ?? lean.id ?? ""),
    sport: "MLB",
    leagueOrCompetition: "MLB",
    predictionTarget: String(lean.marketLabel ?? lean.marketKey ?? "prop"),
    predictionTime,
    eventStartTime,
    dataCutoffTime: predictionTime,
    featureSnapshotTime: predictionTime,
    marketSnapshotTime: explicitMarket ?? (hasOdds ? predictionTime : null),
    // A probable pitcher is confirmed pre-game; a batter lineup is not modeled here → null.
    lineupSnapshotTime: explicitLineup ?? (isPitcher ? predictionTime : null),
    injurySnapshotTime: null,
    weatherSnapshotTime: null,
  };
}

/**
 * Leakage-safe rolling window from the board's recentGames. windowEnd is the last PRE-event game,
 * and `includesTargetEventFlag` is always false — the methodology contract for a non-leaking window.
 */
export function buildRollingWindows(lean: MlbBoardLean): RollingWindowMeta[] {
  const games = Array.isArray(lean.recentGames) ? lean.recentGames : [];
  const dates = games.map((g) => g?.date).filter((d): d is string => typeof d === "string").sort();
  if (dates.length === 0) return [];
  return [
    {
      windowStartTime: dates[0],
      windowEndTime: dates[dates.length - 1],
      sampleSize: num(lean.samples) ?? games.length,
      includesTargetEventFlag: false,
    },
  ];
}

// ── Confidence / risk / factor mapping (MLB) ─────────────────────────────────────────────────────

interface DerivedSignals {
  side: "Over" | "Under";
  modelProb: number | null;
  marketImplied: number | null;
  edge: number | null;
  isPitcher: boolean;
  samples: number;
  anomaly: boolean;
  staleMarket: boolean;
  staleLineup: boolean;
  missingCritical: boolean;
  directionConsistency: number; // 0..1, recent games on the chosen side of the line
  volatility: number; // 0..1
}

function deriveMlbSignals(
  lean: MlbBoardLean,
  snapshot: PredictionSnapshotMetadata,
  opts: MethodologyOptions,
): DerivedSignals {
  const side: "Over" | "Under" = (lean.lean ?? "Over") === "Under" ? "Under" : "Over";
  const isPitcher = (lean.playerRole ?? "").toLowerCase() === "pitcher";
  const samples = num(lean.samples) ?? 0;

  const modelProbRaw = side === "Over" ? num(lean.modelProbOver) : num(lean.modelProbUnder);
  const modelProb = modelProbRaw == null ? null : clampProb(modelProbRaw);

  // Market-implied is no-vig; only computed in market-aware mode and when both prices exist.
  let marketImplied: number | null = null;
  let edge: number | null = null;
  if (opts.marketAware) {
    const oddsForSide = side === "Over" ? num(lean.oddsOver) : num(lean.oddsUnder);
    const oddsOther = side === "Over" ? num(lean.oddsUnder) : num(lean.oddsOver);
    const nv = noVigTwoWay(oddsForSide, oddsOther);
    marketImplied =
      nv != null ? clampProb(nv.side) : (americanToImpliedRaw(oddsForSide) ?? null);
    if (marketImplied != null) marketImplied = clampProb(marketImplied);
    edge = edgePoints(modelProb, marketImplied);
  }

  // Direction consistency: share of recent (pre-event) games on the chosen side of the line.
  const line = num(lean.line);
  const series = Array.isArray(lean.recentSeries) ? lean.recentSeries.filter((v) => Number.isFinite(v)) : [];
  let directionConsistency = 0.5;
  if (series.length > 0 && line != null) {
    const onSide = series.filter((v) => (side === "Over" ? v > line : v < line)).length;
    directionConsistency = onSide / series.length;
  }

  const flags = Array.isArray(lean.riskFlags) ? lean.riskFlags : [];
  const anomaly = flags.some((f) => /anomaly|r5/i.test(String(f)));

  // Staleness measured AT prediction time (leakage-consistent): age = predictionTime − snapshotTime.
  const sm = staleFlag("market", snapshot.marketSnapshotTime, FRESHNESS_THRESHOLDS.market, snapshot.predictionTime);
  const sl = staleFlag("lineup", snapshot.lineupSnapshotTime, FRESHNESS_THRESHOLDS.lineup, snapshot.predictionTime);
  const staleMarket = sm != null;
  const staleLineup = sl != null;

  // Missing critical: no model signal at all, or (market-aware) no market price.
  const missingCritical = modelProb == null || (opts.marketAware && marketImplied == null);

  const sigma = num(lean.sigma);
  const projection = num(lean.projection);
  const sigmaRatio = sigma != null && projection != null && projection > 0 ? clamp01(sigma / projection) : 0;
  const volatility = clamp01((anomaly ? 0.6 : 0) + 0.4 * sigmaRatio);

  return {
    side, modelProb, marketImplied, edge, isPitcher, samples, anomaly,
    staleMarket, staleLineup, missingCritical, directionConsistency, volatility,
  };
}

function mlbConfidenceComponents(s: DerivedSignals, opts: MethodologyOptions): ConfidenceComponents {
  const dataFreshnessScore = clamp01(1 - (s.staleMarket ? 0.5 : 0) - (s.staleLineup ? 0.3 : 0));
  const roleCertaintyScore = s.isPitcher ? 0.9 : 0.55;
  const sampleSizeScore = sampleWeight(s.samples);
  const modelAgreementScore = clamp01(s.directionConsistency);
  const marketAgreementScore =
    opts.marketAware && s.edge != null ? clamp01(1 - Math.abs(s.edge) / 40) : 0;
  const lineupCertaintyScore = s.isPitcher ? 1 : 0.4;
  const projectionVolatilityPenalty = s.volatility;
  const missingCriticalDataPenalty = s.missingCritical ? 0.6 : 0;
  return {
    dataFreshnessScore, roleCertaintyScore, sampleSizeScore, modelAgreementScore,
    marketAgreementScore, lineupCertaintyScore, projectionVolatilityPenalty, missingCriticalDataPenalty,
  };
}

const FRAGILE_MLB_MARKETS = new Set(["batter_home_runs", "batter_hits", "batter_total_bases"]);
function isFragileMlb(lean: MlbBoardLean): boolean {
  const mk = String(lean.marketKey ?? "");
  const line = num(lean.line);
  return FRAGILE_MLB_MARKETS.has(mk) || (line != null && line <= 1);
}

function mlbRiskInputs(lean: MlbBoardLean, s: DerivedSignals): RiskInputs {
  return {
    roleUncertainty: s.isPitcher ? 0.15 : 0.6,
    staleData: s.staleMarket || s.staleLineup,
    missingCriticalData: s.missingCritical,
    smallSample: smallSampleFlag(s.samples),
    volatileMarket: s.anomaly,
    fragilePropType: isFragileMlb(lean),
    dnpOrScratchRisk: !s.isPitcher, // batter without a confirmed lineup
    overCorrelation: false, // single-pick dry-run carries no parlay context
  };
}

function mlbFactors(lean: MlbBoardLean, s: DerivedSignals): { pos: TopFactor[]; neg: TopFactor[] } {
  const pos: TopFactor[] = [];
  const neg: TopFactor[] = [];
  if (s.edge != null && s.edge > 0) pos.push({ label: `+${s.edge.toFixed(1)}pp model edge vs no-vig market`, direction: "positive", weight: Math.min(1, s.edge / 20) });
  if (s.directionConsistency >= 0.6) pos.push({ label: `recent form supports the ${s.side.toLowerCase()} (${Math.round(s.directionConsistency * 100)}% of games)`, direction: "positive", weight: s.directionConsistency });
  if (s.samples >= 16) pos.push({ label: `${s.samples}-game sample`, direction: "positive", weight: sampleWeight(s.samples) });
  if (s.isPitcher) pos.push({ label: "confirmed probable starter (role known)", direction: "positive", weight: 0.5 });

  if (smallSampleFlag(s.samples)) neg.push({ label: `small sample (${s.samples} games)`, direction: "negative", weight: 1 - sampleWeight(s.samples) });
  if (s.anomaly) neg.push({ label: "model edge above anomaly threshold (calibration watch)", direction: "negative", weight: 0.8 });
  if (!s.isPitcher) neg.push({ label: "batter lineup not confirmed (DNP risk)", direction: "negative", weight: 0.6 });
  if (s.staleMarket || s.staleLineup) neg.push({ label: "a critical input is stale", direction: "negative", weight: 0.6 });
  if (s.missingCritical) neg.push({ label: "a critical input is missing", direction: "negative", weight: 1 });

  pos.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  neg.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  return { pos: pos.slice(0, 3), neg: neg.slice(0, 3) };
}

function mlbFlags(
  lean: MlbBoardLean,
  s: DerivedSignals,
  snapshot: PredictionSnapshotMetadata,
  opts: MethodologyOptions,
): { missing: MissingDataFlag[]; stale: StaleDataFlag[]; small: SmallSampleFlag[] } {
  const missing: MissingDataFlag[] = [];
  if (s.modelProb == null) missing.push({ field: "modelProbability", critical: true, reason: "no model projection" });
  if (opts.marketAware && s.marketImplied == null) missing.push({ field: "marketOdds", critical: true, reason: "no market price for the chosen side" });
  if (!s.isPitcher) missing.push({ field: "confirmed_lineup", critical: false, reason: "batter lineup not confirmed pre-prediction" });
  // Registry-defined-but-not-live features surfaced as planned/not_available context.
  missing.push(...surfacedContextFlags("MLB"));

  const stale: StaleDataFlag[] = [];
  const sm = staleFlag("market", snapshot.marketSnapshotTime, FRESHNESS_THRESHOLDS.market, snapshot.predictionTime);
  if (sm) stale.push(sm);
  const sl = staleFlag("lineup", snapshot.lineupSnapshotTime, FRESHNESS_THRESHOLDS.lineup, snapshot.predictionTime);
  if (sl) stale.push(sl);

  const small: SmallSampleFlag[] = [];
  if (smallSampleFlag(s.samples)) small.push({ field: "recent_form", sampleSize: s.samples, bucket: sampleSizeBucket(s.samples) });
  return { missing, stale, small };
}

function mlbDataQuality(lean: MlbBoardLean, s: DerivedSignals, opts: MethodologyOptions): DataQualityGrade {
  return dataQualityTier({
    hasCurrentOdds: opts.marketAware && s.marketImplied != null,
    hasFullStats: num(lean.projection) != null && s.samples >= 5,
    eventConfirmed: !!s.modelProb || num(lean.projection) != null,
    freshness: clamp01(1 - (s.staleMarket ? 0.5 : 0) - (s.staleLineup ? 0.3 : 0)),
    sampleSize: s.samples,
  });
}

// ── Public: map one MLB lean → AdaptedPrediction ────────────────────────────────────────────────

export function adaptMlbLean(
  lean: MlbBoardLean,
  board: BoardMeta,
  opts: MethodologyOptions = DEFAULT_OPTIONS,
): AdaptedPrediction {
  const snapshot = buildMlbSnapshot(lean, board);
  const rollingWindows = buildRollingWindows(lean);
  const leakage = validateLeakage(snapshot, rollingWindows);
  const s = deriveMlbSignals(lean, snapshot, opts);

  const components = mlbConfidenceComponents(s, opts);
  // A leakage failure is itself a critical-data problem → force No Bet by penalty.
  if (!leakage.passed) components.missingCriticalDataPenalty = Math.max(components.missingCriticalDataPenalty, 0.6);
  const confidence = computeConfidence(components);

  const riskInputs = mlbRiskInputs(lean, s);
  if (!leakage.passed) riskInputs.missingCriticalData = true;
  const risk = computeRisk(riskInputs);

  const { pos, neg } = mlbFactors(lean, s);
  const { missing, stale, small } = mlbFlags(lean, s, snapshot, opts);
  if (!leakage.passed) missing.unshift({ field: "leakage", critical: true, reason: "prediction failed leakage validation" });

  const modelMode: ModelMode = opts.marketAware ? "market_aware_model" : "no_market_model";

  const output: PredictionOutput = {
    eventId: snapshot.eventId,
    sport: "MLB",
    predictionTarget: snapshot.predictionTarget,
    participant: String(lean.playerName ?? ""),
    line: num(lean.line),
    marketOdds: opts.marketAware ? (s.side === "Over" ? num(lean.oddsOver) : num(lean.oddsUnder)) : null,
    marketImpliedProbability: s.marketImplied,
    modelProjection: num(lean.projection),
    modelProbability: s.modelProb,
    edge: s.edge,
    confidenceScore: confidence.category,
    riskScore: risk.score,
    dataQuality: mlbDataQuality(lean, s, opts),
    modelMode,
    topPositiveFactors: pos,
    topNegativeFactors: neg,
    missingDataFlags: missing,
    staleDataFlags: stale,
    smallSampleFlags: small,
    leakageValidationPassed: leakage.passed,
  };

  return { output, snapshot, leakage, rollingWindows };
}

// ── Public: run the methodology over a whole board ───────────────────────────────────────────────

const EXTRACTORS: Partial<Record<Sport, (lean: any, board: BoardMeta, opts: MethodologyOptions) => AdaptedPrediction>> = {
  MLB: adaptMlbLean,
  // NBA / WORLD_CUP extractors are the next wiring step. NBA boards are empty in-season June; the
  // World Cup uses a separate data shape. Left unimplemented rather than fabricated.
};

export function supportedSports(): Sport[] {
  return Object.keys(EXTRACTORS) as Sport[];
}

/**
 * Map every lean on a board into a methodology PredictionOutput, splitting on the leakage gate.
 * Read-only: `board` is the Python-generated JSON; nothing is written or published here.
 */
export function runMethodology(
  board: { leans?: unknown[] } & BoardMeta,
  sport: Sport,
  opts: MethodologyOptions = DEFAULT_OPTIONS,
): MethodologyRunResult {
  const extractor = EXTRACTORS[sport];
  if (!extractor) {
    throw new Error(`No methodology extractor wired for sport "${sport}" yet (supported: ${supportedSports().join(", ")}).`);
  }
  const leans = Array.isArray(board.leans) ? board.leans : [];
  const accepted: AdaptedPrediction[] = [];
  const rejectedByLeakage: AdaptedPrediction[] = [];
  for (const lean of leans) {
    const adapted = extractor(lean, board, opts);
    (adapted.leakage.passed ? accepted : rejectedByLeakage).push(adapted);
  }
  return {
    sport,
    boardDate: String(board.generatedFor ?? board.date ?? "") || null,
    predictionTime: String(board.generatedAt ?? "") || null,
    modelMode: opts.marketAware ? "market_aware_model" : "no_market_model",
    accepted,
    rejectedByLeakage,
  };
}
