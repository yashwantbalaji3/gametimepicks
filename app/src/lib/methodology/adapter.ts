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
  /** The chosen side/pick (Over/Under/Yes/No/home/draw/away/moneyline...) — for correlation. */
  side?: string;
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

  return { output, snapshot, leakage, rollingWindows, side: s.side };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// Generic signal → confidence / risk / factor builders (shared by NBA / UFC / World Cup)
// MLB keeps its own bespoke helpers above; these mirror the same formula for the other sports so all
// four follow ONE methodology process. Pure.
// ════════════════════════════════════════════════════════════════════════════════════════════════

export type MarketScope =
  | "90_minutes" | "includes_extra_time" | "advancement" | "full_game" | "full_fight" | "unknown";

interface GenericSignals {
  side: string;
  modelProb: number | null;
  marketImplied: number | null;
  edge: number | null;
  roleCertainty: number;        // 0..1
  lineupCertainty: number;      // 0..1
  samples: number | null;       // null = no recent-games count for this sport/market
  dataQualityScore: number;     // 0..1 — used for sample score when samples is null
  directionConsistency: number; // 0..1
  staleMarket: boolean;
  staleLineup: boolean;
  missingCritical: boolean;
  volatility: number;           // 0..1
  fragile: boolean;
  dnpRisk: boolean;
  marketScope: MarketScope;
  marketScopeUnknown: boolean;
}

function confidenceFromSignals(g: GenericSignals, opts: MethodologyOptions): ConfidenceComponents {
  const dataFreshnessScore = clamp01(1 - (g.staleMarket ? 0.5 : 0) - (g.staleLineup ? 0.3 : 0));
  const sampleSizeScore = g.samples == null ? clamp01(g.dataQualityScore) : sampleWeight(g.samples);
  const marketAgreementScore =
    opts.marketAware && g.edge != null ? clamp01(1 - Math.abs(g.edge) / 40) : 0;
  // An unknown market scope (e.g. 90-min vs advancement ambiguity) is an honesty penalty.
  const scopePenalty = g.marketScopeUnknown ? 0.2 : 0;
  return {
    dataFreshnessScore,
    roleCertaintyScore: clamp01(g.roleCertainty),
    sampleSizeScore,
    modelAgreementScore: clamp01(g.directionConsistency),
    marketAgreementScore,
    lineupCertaintyScore: clamp01(g.lineupCertainty),
    projectionVolatilityPenalty: clamp01(g.volatility + scopePenalty),
    missingCriticalDataPenalty: g.missingCritical ? 0.6 : 0,
  };
}

function riskFromSignals(g: GenericSignals): RiskInputs {
  return {
    roleUncertainty: clamp01(1 - g.roleCertainty),
    staleData: g.staleMarket || g.staleLineup,
    missingCriticalData: g.missingCritical,
    smallSample: g.samples != null && smallSampleFlag(g.samples),
    volatileMarket: g.volatility >= 0.5 || g.marketScopeUnknown,
    fragilePropType: g.fragile,
    dnpOrScratchRisk: g.dnpRisk,
    overCorrelation: false,
  };
}

function factorsFromSignals(g: GenericSignals): { pos: TopFactor[]; neg: TopFactor[] } {
  const pos: TopFactor[] = [];
  const neg: TopFactor[] = [];
  if (g.edge != null && g.edge > 0) pos.push({ label: `+${g.edge.toFixed(1)}pp model edge vs no-vig market`, direction: "positive", weight: Math.min(1, g.edge / 20) });
  if (g.roleCertainty >= 0.8) pos.push({ label: "confirmed role / participation", direction: "positive", weight: g.roleCertainty });
  if (g.samples != null && g.samples >= 16) pos.push({ label: `${g.samples}-game sample`, direction: "positive", weight: sampleWeight(g.samples) });
  if (g.dataQualityScore >= 0.9 && g.samples == null) pos.push({ label: "high model data quality", direction: "positive", weight: g.dataQualityScore });

  if (g.samples != null && smallSampleFlag(g.samples)) neg.push({ label: `small sample (${g.samples})`, direction: "negative", weight: 1 - sampleWeight(g.samples) });
  if (g.marketScopeUnknown) neg.push({ label: "market scope unknown (90-min vs advancement) — penalized", direction: "negative", weight: 0.7 });
  if (g.dnpRisk) neg.push({ label: "participation not confirmed (DNP/scratch risk)", direction: "negative", weight: 0.6 });
  if (g.fragile) neg.push({ label: "fragile single-participant market", direction: "negative", weight: 0.5 });
  if (g.staleMarket || g.staleLineup) neg.push({ label: "a critical input is stale", direction: "negative", weight: 0.6 });
  if (g.missingCritical) neg.push({ label: "a critical input is missing", direction: "negative", weight: 1 });

  pos.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  neg.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  return { pos: pos.slice(0, 3), neg: neg.slice(0, 3) };
}

function genericFlags(
  g: GenericSignals,
  snapshot: PredictionSnapshotMetadata,
  sport: Sport,
  opts: MethodologyOptions,
): { missing: MissingDataFlag[]; stale: StaleDataFlag[]; small: SmallSampleFlag[] } {
  const missing: MissingDataFlag[] = [];
  if (g.modelProb == null) missing.push({ field: "modelProbability", critical: true, reason: "no model projection" });
  if (opts.marketAware && g.marketImplied == null) missing.push({ field: "marketOdds", critical: true, reason: "no market price for the chosen side" });
  if (g.dnpRisk) missing.push({ field: "confirmed_lineup", critical: false, reason: "participant not confirmed pre-prediction" });
  missing.push(...surfacedContextFlags(sport));

  const stale: StaleDataFlag[] = [];
  const sm = staleFlag("market", snapshot.marketSnapshotTime, FRESHNESS_THRESHOLDS.market, snapshot.predictionTime);
  if (sm) stale.push(sm);
  const sl = staleFlag("lineup", snapshot.lineupSnapshotTime, FRESHNESS_THRESHOLDS.lineup, snapshot.predictionTime);
  if (sl) stale.push(sl);

  const small: SmallSampleFlag[] = [];
  if (g.samples != null && smallSampleFlag(g.samples)) small.push({ field: "recent_form", sampleSize: g.samples, bucket: sampleSizeBucket(g.samples) });
  return { missing, stale, small };
}

function assemble(
  sport: Sport,
  base: {
    eventId: string; predictionTarget: string; participant: string;
    line: number | null; marketOdds: number | null; modelProjection: number | null;
  },
  g: GenericSignals,
  snapshot: PredictionSnapshotMetadata,
  rollingWindows: RollingWindowMeta[],
  opts: MethodologyOptions,
): AdaptedPrediction {
  const leakage = validateLeakage(snapshot, rollingWindows);
  const components = confidenceFromSignals(g, opts);
  if (!leakage.passed) components.missingCriticalDataPenalty = Math.max(components.missingCriticalDataPenalty, 0.6);
  const confidence = computeConfidence(components);

  const riskInputs = riskFromSignals(g);
  if (!leakage.passed) riskInputs.missingCriticalData = true;
  const risk = computeRisk(riskInputs);

  const { pos, neg } = factorsFromSignals(g);
  const { missing, stale, small } = genericFlags(g, snapshot, sport, opts);
  if (!leakage.passed) missing.unshift({ field: "leakage", critical: true, reason: "prediction failed leakage validation" });

  const dataQuality: DataQualityGrade = dataQualityTier({
    hasCurrentOdds: opts.marketAware && g.marketImplied != null,
    hasFullStats: g.dataQualityScore >= 0.6 || (g.samples != null && g.samples >= 5),
    eventConfirmed: g.modelProb != null,
    freshness: clamp01(1 - (g.staleMarket ? 0.5 : 0) - (g.staleLineup ? 0.3 : 0)),
    sampleSize: g.samples ?? (g.dataQualityScore >= 0.6 ? 5 : 0),
  });

  const output: PredictionOutput = {
    eventId: base.eventId,
    sport,
    predictionTarget: base.predictionTarget,
    participant: base.participant,
    line: base.line,
    marketOdds: opts.marketAware ? base.marketOdds : null,
    marketImpliedProbability: opts.marketAware ? g.marketImplied : null,
    modelProjection: base.modelProjection,
    modelProbability: g.modelProb,
    edge: opts.marketAware ? g.edge : null,
    confidenceScore: confidence.category,
    riskScore: risk.score,
    dataQuality,
    modelMode: opts.marketAware ? "market_aware_model" : "no_market_model",
    topPositiveFactors: pos,
    topNegativeFactors: neg,
    missingDataFlags: missing,
    staleDataFlags: stale,
    smallSampleFlags: small,
    leakageValidationPassed: leakage.passed,
  };
  return { output, snapshot, leakage, rollingWindows, side: g.side };
}

// ── NBA extractor (board lean shape; NBA boards are often empty in June) ────────────────────────
export function adaptNbaLean(lean: any, board: BoardMeta, opts: MethodologyOptions = DEFAULT_OPTIONS): AdaptedPrediction {
  const predictionTime = String(board.generatedAt ?? "");
  const eventStartTime = String(lean.commenceTime ?? lean.tipoffUtc ?? lean.gameDate ?? "");
  const side: string = (lean.lean ?? lean.pickType ?? "Over");
  const modelProb = num(lean.modelProbability);
  let marketImplied: number | null = null;
  let edge: number | null = null;
  if (opts.marketAware) {
    const oddsForSide = side === "Under" ? num(lean.oddsUnder) : num(lean.oddsOver);
    const oddsOther = side === "Under" ? num(lean.oddsOver) : num(lean.oddsUnder);
    const nv = noVigTwoWay(oddsForSide, oddsOther);
    marketImplied = nv != null ? clampProb(nv.side) : (num(lean.impliedProbability) ?? americanToImpliedRaw(oddsForSide));
    if (marketImplied != null) marketImplied = clampProb(marketImplied);
    edge = edgePoints(modelProb, marketImplied);
  }
  const samples = num(lean.gp_last_10) ?? (Array.isArray(lean.recent10) ? lean.recent10.length : null) ?? num(lean.samples);
  const snapshot: PredictionSnapshotMetadata = {
    eventId: String(lean.gameId ?? lean.id ?? ""),
    sport: "NBA",
    leagueOrCompetition: "NBA",
    predictionTarget: String(lean.market ?? "prop"),
    predictionTime,
    eventStartTime,
    dataCutoffTime: predictionTime,
    featureSnapshotTime: predictionTime,
    marketSnapshotTime: (lean.oddsOver != null || lean.oddsUnder != null) ? predictionTime : null,
    lineupSnapshotTime: null,
    injurySnapshotTime: null,
    weatherSnapshotTime: null,
  };
  const g: GenericSignals = {
    side,
    modelProb,
    marketImplied,
    edge,
    roleCertainty: 0.7,
    lineupCertainty: 0.6,
    samples: samples ?? null,
    dataQualityScore: num(lean.sourceReliability) ?? 0.5,
    directionConsistency: 0.5,
    staleMarket: false,
    staleLineup: false,
    missingCritical: modelProb == null || (opts.marketAware && marketImplied == null),
    volatility: Array.isArray(lean.riskFlags) && lean.riskFlags.length ? 0.4 : 0.2,
    fragile: true,
    dnpRisk: false,
    marketScope: "full_game",
    marketScopeUnknown: false,
  };
  return assemble("NBA", {
    eventId: snapshot.eventId,
    predictionTarget: String(lean.market ?? "prop"),
    participant: String(lean.playerName ?? ""),
    line: num(lean.line),
    marketOdds: side === "Under" ? num(lean.oddsUnder) : num(lean.oddsOver),
    modelProjection: num(lean.modelProjection ?? lean.projection),
  }, g, snapshot, [], opts);
}
// (NBA side flows through `assemble` via g.side)

// ── UFC extractor (moneyline only; props provider not connected → not_available) ────────────────
export function adaptUfcBout(rec: any, meta: BoardMeta & { eventStartTime?: string }, opts: MethodologyOptions = DEFAULT_OPTIONS): AdaptedPrediction {
  const predictionTime = String(meta.generatedAt ?? "");
  const eventStartTime = String(rec.commenceTime ?? meta.eventStartTime ?? "");
  const modelProb = num(rec.modelProbability);
  const marketImplied = opts.marketAware ? num(rec.marketImpliedProbability) : null;
  const edge = opts.marketAware ? edgePoints(modelProb, marketImplied) : null;
  const dq = num(rec.dataQuality);
  const snapshot: PredictionSnapshotMetadata = {
    eventId: String(rec.boutId ?? ""),
    sport: "UFC",
    leagueOrCompetition: "UFC",
    predictionTarget: "moneyline",
    predictionTime,
    eventStartTime,
    dataCutoffTime: predictionTime,
    featureSnapshotTime: predictionTime,
    marketSnapshotTime: rec.oddsPrice != null ? predictionTime : null,
    lineupSnapshotTime: predictionTime, // fighters are confirmed on the card
    injurySnapshotTime: null,
    weatherSnapshotTime: null,
  };
  const g: GenericSignals = {
    side: "moneyline",
    modelProb,
    marketImplied,
    edge,
    roleCertainty: 0.85,
    lineupCertainty: 0.85,
    samples: null,
    dataQualityScore: dq != null ? clamp01(dq) : 0.5,
    directionConsistency: 0.5,
    staleMarket: false,
    staleLineup: false,
    missingCritical: modelProb == null || (opts.marketAware && marketImplied == null),
    volatility: 0.3,
    fragile: false,
    dnpRisk: false,
    marketScope: "full_fight",
    marketScopeUnknown: false,
  };
  return assemble("UFC", {
    eventId: snapshot.eventId,
    predictionTarget: "moneyline",
    participant: String(rec.fighter ?? ""),
    line: null,
    marketOdds: num(rec.oddsPrice),
    modelProjection: modelProb,
  }, g, snapshot, [], opts);
}

// ── World Cup extractor (team + player markets; 90-min ONLY in current data) ────────────────────
export function adaptWorldCupRecord(rec: any, meta: BoardMeta, opts: MethodologyOptions = DEFAULT_OPTIONS): AdaptedPrediction {
  const predictionTime = String(meta.generatedAt ?? "");
  const eventStartTime = String(rec.kickoffUtc ?? rec.startTime ?? "");
  const market = String(rec.market ?? "");
  const isPlayer = /^player_/.test(market) || (rec.player && typeof rec.player === "object");
  const modelProb = num(rec.modelProbability);
  const marketImplied = opts.marketAware ? num(rec.marketProbability) : null;
  const edge = opts.marketAware ? edgePoints(modelProb, marketImplied) : null;

  // Market scope: current WC data is 90-minute regulation only; advancement markets do not exist.
  // Map honestly from regulationOnly / settlementSupport; unknown only if neither is present.
  const settlement = String(rec.settlementSupport ?? "");
  const adv = /advancement|to_qualify|to_win_outright|reach_|winner/i.test(market);
  let marketScope: MarketScope;
  let marketScopeUnknown = false;
  if (adv) marketScope = "advancement";
  else if (rec.regulationOnly === true || settlement === "regulation_90") marketScope = "90_minutes";
  else { marketScope = "unknown"; marketScopeUnknown = true; }

  const lineupStatus = String(rec.lineupStatus ?? "");
  const lineupConfirmed = lineupStatus === "confirmed" || lineupStatus === "posted";
  const sampleWarn = rec.sampleSizeWarning === true;
  const dqStr = String(rec.dataQuality ?? "");
  const dqScore = dqStr === "A" ? 1 : dqStr === "B" ? 0.75 : dqStr === "C" ? 0.5 : dqStr === "limited" ? 0.3 : 0.5;

  const snapshot: PredictionSnapshotMetadata = {
    eventId: String(rec.matchId ?? ""),
    sport: "WORLD_CUP",
    leagueOrCompetition: "FIFA World Cup 2026",
    predictionTarget: market || "match_market",
    predictionTime,
    eventStartTime,
    dataCutoffTime: predictionTime,
    featureSnapshotTime: predictionTime,
    marketSnapshotTime: rec.americanOdds != null ? predictionTime : null,
    lineupSnapshotTime: isPlayer ? (lineupConfirmed ? predictionTime : null) : predictionTime,
    injurySnapshotTime: null,
    weatherSnapshotTime: null,
  };
  const g: GenericSignals = {
    side: String(rec.pick ?? rec.side ?? ""),
    modelProb,
    marketImplied,
    edge,
    roleCertainty: isPlayer ? (lineupConfirmed ? 0.7 : 0.4) : 0.85,
    lineupCertainty: isPlayer ? (lineupConfirmed ? 0.8 : 0.3) : 0.85,
    samples: null,
    dataQualityScore: sampleWarn ? Math.min(dqScore, 0.4) : dqScore,
    directionConsistency: 0.5,
    staleMarket: false,
    staleLineup: false,
    missingCritical: modelProb == null || (opts.marketAware && marketImplied == null),
    volatility: sampleWarn ? 0.4 : 0.2,
    fragile: isPlayer,
    dnpRisk: isPlayer && !lineupConfirmed,
    marketScope,
    marketScopeUnknown,
  };
  const participant = isPlayer
    ? String(rec.player?.name ?? rec.playerName ?? "")
    : String(rec.pickLabel ?? rec.pick ?? `${rec.homeTeam ?? ""} v ${rec.awayTeam ?? ""}`);
  return assemble("WORLD_CUP", {
    eventId: snapshot.eventId,
    predictionTarget: market || "match_market",
    participant,
    line: num(rec.line),
    marketOdds: num(rec.americanOdds),
    modelProjection: modelProb,
  }, g, snapshot, [], opts);
}

// ── Public: run the methodology over a leans-based board (MLB / NBA) ─────────────────────────────

const LEAN_EXTRACTORS: Partial<Record<Sport, (lean: any, board: BoardMeta, opts: MethodologyOptions) => AdaptedPrediction>> = {
  MLB: adaptMlbLean,
  NBA: adaptNbaLean,
};

/** All sports whose extractor is wired (produce valid PredictionOutput when source data exists). */
export function supportedSports(): Sport[] {
  return ["MLB", "NBA", "UFC", "WORLD_CUP"];
}

export function runMethodology(
  board: { leans?: unknown[] } & BoardMeta,
  sport: Sport,
  opts: MethodologyOptions = DEFAULT_OPTIONS,
): MethodologyRunResult {
  const extractor = LEAN_EXTRACTORS[sport];
  if (!extractor) {
    throw new Error(`runMethodology is for leans-based boards (MLB/NBA); use extractPredictionsBySport for "${sport}".`);
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

// ════════════════════════════════════════════════════════════════════════════════════════════════
// Cross-sport extraction aggregator — ONE process for every sport.
// ════════════════════════════════════════════════════════════════════════════════════════════════

export type ExtractorStatus = "wired" | "wired_no_candidates" | "source_missing";

export interface SportExtractionResult {
  sport: Sport;
  date: string | null;
  sourcePath: string | null;
  extractorStatus: ExtractorStatus;
  totalCandidates: number;
  predictions: AdaptedPrediction[];
  leakagePassed: number;
  leakageRejected: number;
  noBetCount: number;
  eligibleCandidateCount: number;     // passed leakage AND not No Bet
  missingCriticalDataCount: number;
  staleCriticalDataCount: number;
  notes: string[];
}

/** PredictionOutput[] view (contract alias) for a result's predictions. */
export function predictionOutputsOf(r: SportExtractionResult): PredictionOutput[] {
  return r.predictions.map((p) => p.output);
}

function summarize(
  sport: Sport,
  date: string | null,
  sourcePath: string | null,
  predictions: AdaptedPrediction[],
  notes: string[],
): SportExtractionResult {
  const leakagePassed = predictions.filter((p) => p.leakage.passed).length;
  const noBetCount = predictions.filter((p) => p.output.confidenceScore === "No Bet").length;
  const eligibleCandidateCount = predictions.filter((p) => p.leakage.passed && p.output.confidenceScore !== "No Bet").length;
  const missingCriticalDataCount = predictions.filter((p) => p.output.missingDataFlags.some((f) => f.critical)).length;
  const staleCriticalDataCount = predictions.filter((p) => p.output.staleDataFlags.length > 0).length;
  let extractorStatus: ExtractorStatus = "wired";
  if (predictions.length === 0) extractorStatus = sourcePath ? "wired_no_candidates" : "source_missing";
  return {
    sport, date, sourcePath, extractorStatus,
    totalCandidates: predictions.length,
    predictions,
    leakagePassed,
    leakageRejected: predictions.length - leakagePassed,
    noBetCount,
    eligibleCandidateCount,
    missingCriticalDataCount,
    staleCriticalDataCount,
    notes,
  };
}

export function extractMlbPredictions(board: any, sourcePath: string | null, opts: MethodologyOptions = DEFAULT_OPTIONS): SportExtractionResult {
  const leans = Array.isArray(board?.leans) ? board.leans : [];
  const preds = leans.map((l: any) => adaptMlbLean(l, board, opts));
  return summarize("MLB", String(board?.generatedFor ?? board?.date ?? "") || null, sourcePath, preds, []);
}

export function extractNbaPredictions(board: any, sourcePath: string | null, opts: MethodologyOptions = DEFAULT_OPTIONS): SportExtractionResult {
  const leans = Array.isArray(board?.leans) ? board.leans : [];
  const preds = leans.map((l: any) => adaptNbaLean(l, board, opts));
  const notes = preds.length === 0 ? ["No populated NBA board/candidates for this date"] : [];
  return summarize("NBA", String(board?.generatedFor ?? board?.date ?? "") || null, sourcePath, preds, notes);
}

export function extractUfcPredictions(source: any, sourcePath: string | null, opts: MethodologyOptions = DEFAULT_OPTIONS): SportExtractionResult {
  const recs = Array.isArray(source?.projections) ? source.projections : [];
  const meta: BoardMeta & { eventStartTime?: string } = {
    generatedAt: source?.generatedAt,
    eventStartTime: source?.eventDate,
    date: source?.eventDate,
  };
  const preds = recs.map((r: any) => adaptUfcBout(r, meta, opts));
  const notes: string[] = [];
  if (preds.length === 0) notes.push("No UFC projections found for this date");
  if (source?.marketScope && source.marketScope !== "h2h_moneyline_only") notes.push(`UFC market scope: ${source.marketScope}`);
  notes.push("UFC method/round/distance props not_available (no prop-odds provider connected)");
  return summarize("UFC", String(source?.eventDate ?? "").slice(0, 10) || null, sourcePath, preds, notes);
}

export function extractWorldCupPredictions(teamSource: any, playerSource: any, sourcePath: string | null, opts: MethodologyOptions = DEFAULT_OPTIONS): SportExtractionResult {
  const teamRecs: any[] = Array.isArray(teamSource?.public) ? teamSource.public : (Array.isArray(teamSource?.projections) ? teamSource.projections : []);
  const playerRecs: any[] = Array.isArray(playerSource?.public)
    ? playerSource.public
    : (Array.isArray(playerSource?.matches) ? playerSource.matches.flatMap((m: any) => Array.isArray(m?.projections) ? m.projections : []) : []);
  const teamMeta: BoardMeta = { generatedAt: teamSource?.generatedAt, date: teamSource?.date };
  const playerMeta: BoardMeta = { generatedAt: playerSource?.generatedAt ?? teamSource?.generatedAt, date: playerSource?.date };
  const preds = [
    ...teamRecs.map((r) => adaptWorldCupRecord(r, teamMeta, opts)),
    ...playerRecs.map((r) => adaptWorldCupRecord(r, playerMeta, opts)),
  ];
  const notes = ["World Cup markets are 90-minute regulation only in current data; advancement markets are not available (never fabricated)."];
  if (preds.length === 0) notes.unshift("No World Cup odds/projections for this date (schedule-only)");
  return summarize("WORLD_CUP", String(teamSource?.date ?? playerSource?.date ?? "") || null, sourcePath, preds, notes);
}

/** Dispatch: extract for one sport from its already-loaded source data. Pure (no fs). */
export function extractPredictionsBySport(
  sport: Sport,
  source: { mlb?: any; nba?: any; ufc?: any; worldCupTeam?: any; worldCupPlayer?: any; sourcePath?: string | null },
  opts: MethodologyOptions = DEFAULT_OPTIONS,
): SportExtractionResult {
  const sp = source.sourcePath ?? null;
  switch (sport) {
    case "MLB": return extractMlbPredictions(source.mlb, source.mlb ? sp : null, opts);
    case "NBA": return extractNbaPredictions(source.nba, source.nba ? sp : null, opts);
    case "UFC": return extractUfcPredictions(source.ufc, source.ufc ? sp : null, opts);
    case "WORLD_CUP": return extractWorldCupPredictions(source.worldCupTeam, source.worldCupPlayer, (source.worldCupTeam || source.worldCupPlayer) ? sp : null, opts);
    default: throw new Error(`Unknown sport: ${sport}`);
  }
}
