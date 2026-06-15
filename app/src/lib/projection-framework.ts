/**
 * projection-framework — the canonical, cross-sport projection + card vocabulary
 * and the shared scoring formulas the product standardizes on (June 15 upgrade).
 *
 * WHY THIS EXISTS: edge / confidence / data-quality / parlay-eligibility were
 * computed ad hoc per sport and per call site. This module is the single, pure,
 * deterministic source of truth for those formulas so every sport reports the
 * same fields the same way. It is ADDITIVE — it consolidates and documents; it
 * does not delete or silently re-point the existing per-sport models, the
 * optimizer, or any published number. Wiring a guardrail here into a path that
 * changes a settled/published value still requires the repo's operator-approved
 * promotion path.
 *
 * PURE: no fs/path, no fetches, no Date.now / Math.random — safe in both server
 * and client components, and fully unit-testable.
 *
 * HONESTY: probabilities are bounded to (0.5%, 99.5%); a missing price yields a
 * null/`unavailable` result, never a fabricated one. No "safe / lock / guaranteed"
 * language — a low-variance card is "lower-variance", never a guarantee.
 */

// ---------------------------------------------------------------------------
// Canonical field vocabulary (the schema every projection / card should speak)
// ---------------------------------------------------------------------------

export type RiskTier =
  | "lower-variance"
  | "balanced"
  | "high-risk value"
  | "longshot";

export type ConfidenceBucket =
  | "watchlist"
  | "lean"
  | "standard"
  | "strong"
  | "high-risk value"
  | "longshot";

/** Coarse data-quality grade. `D` is below the paid-card threshold. */
export type DataQualityGrade = "A" | "B" | "C" | "D" | "unavailable";

/** The canonical projection record. Sport adapters should map onto this. */
export interface UnifiedProjection {
  sport: string;
  league: string;
  eventId: string;
  eventDate: string; // YYYY-MM-DD (ET)
  startTime: string | null;
  market: string;
  selection: string;
  line: number | null;
  odds: number | null; // American; null when no market price
  book: string | null;
  modelProbability: number | null;
  marketProbability: number | null; // no-vig when both sides known
  edge: number | null; // percentage points
  confidence: ConfidenceBucket;
  riskTier: RiskTier;
  dataQuality: DataQualityGrade;
  sourceFreshness: string; // e.g. "live", "cached:2026-06-11", "stale"
  oddsBacked: boolean;
  modelOnly: boolean;
  parlayEligible: boolean;
  reasoningSummary: string;
  settlementStatus: "pending" | "won" | "lost" | "push" | "void" | "needs_review";
  officialResultSource: string | null;
  createdAt: string; // ISO; stamped by the caller, never by this module
}

// ---------------------------------------------------------------------------
// Odds → probability
// ---------------------------------------------------------------------------

const P_FLOOR = 0.005;
const P_CEIL = 0.995;

/** Clamp a probability into the honest (0.5%, 99.5%) band. */
export function clampProb(p: number): number {
  if (!Number.isFinite(p)) return NaN;
  return Math.min(P_CEIL, Math.max(P_FLOOR, p));
}

/** Raw implied probability from American odds (vig still included). */
export function americanToImpliedRaw(odds: number | null | undefined): number | null {
  if (typeof odds !== "number" || !Number.isFinite(odds) || odds === 0) return null;
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

/**
 * No-vig two-way market probability. Given both sides' American prices, strip
 * the overround proportionally so the two implied probabilities sum to 1.
 * Returns null if either side's price is missing. This is the preferred
 * `marketProbability` whenever the opposing price is known.
 */
export function noVigTwoWay(
  oddsForSide: number | null | undefined,
  oddsOtherSide: number | null | undefined,
): { side: number; other: number } | null {
  const a = americanToImpliedRaw(oddsForSide);
  const b = americanToImpliedRaw(oddsOtherSide);
  if (a == null || b == null) return null;
  const sum = a + b;
  if (sum <= 0) return null;
  return { side: a / sum, other: b / sum };
}

/**
 * Best available market probability for a single side:
 * - no-vig when the opposing price is known,
 * - else the raw single-sided implied,
 * - else null.
 */
export function marketProbability(
  oddsForSide: number | null | undefined,
  oddsOtherSide?: number | null | undefined,
): number | null {
  const novig = noVigTwoWay(oddsForSide, oddsOtherSide);
  if (novig) return clampProb(novig.side);
  const raw = americanToImpliedRaw(oddsForSide);
  return raw == null ? null : clampProb(raw);
}

/** Edge in percentage points: (model − market) × 100. Null if either missing. */
export function edgePoints(
  modelProbability: number | null | undefined,
  marketProb: number | null | undefined,
): number | null {
  if (
    typeof modelProbability !== "number" || !Number.isFinite(modelProbability) ||
    typeof marketProb !== "number" || !Number.isFinite(marketProb)
  ) {
    return null;
  }
  return (clampProb(modelProbability) - clampProb(marketProb)) * 100;
}

// ---------------------------------------------------------------------------
// Composite confidence — NOT just model probability
// ---------------------------------------------------------------------------

export interface ConfidenceInputs {
  /** model probability for the chosen side, 0..1 */
  modelProbability: number;
  /** edge in percentage points (model − market) */
  edgePp: number;
  /** 0..1 — how complete the stat inputs are */
  dataCompleteness: number;
  /** count of recent/relevant samples behind the projection */
  sampleSize: number;
  /** 0..1 — 1 = live/current source, lower = cached/stale */
  freshness: number;
  /** true when the model agrees with the market side (no contrarian risk) */
  marketAgrees: boolean;
  /** optional 0..1 penalty for known injury/news/lineup uncertainty (0 = none) */
  uncertaintyPenalty?: number;
}

/**
 * Composite confidence score in [0,1]. Deliberately blends signal quality with
 * data quality so a thin-sample, stale, contrarian edge cannot read "strong".
 *
 *   base   = edge component (capped) + model-prob component
 *   gates  = completeness × freshness × sample-confidence × (1 − uncertainty)
 *   score  = base × gates, with a small contrarian (market-disagreement) discount
 */
export function compositeConfidenceScore(inp: ConfidenceInputs): number {
  const edgeComponent = Math.min(1, Math.max(0, inp.edgePp) / 12) * 0.5; // ~12pp saturates
  const probComponent = Math.min(1, Math.max(0, (inp.modelProbability - 0.5) / 0.45)) * 0.5;
  const base = edgeComponent + probComponent; // 0..1

  const completeness = clamp01(inp.dataCompleteness);
  const freshness = clamp01(inp.freshness);
  // sample-confidence saturates around ~10 samples; 0 samples ⇒ heavy discount
  const sampleConf = inp.sampleSize <= 0 ? 0.15 : Math.min(1, 0.4 + inp.sampleSize / 16);
  const uncertainty = clamp01(inp.uncertaintyPenalty ?? 0);
  const gates = completeness * freshness * sampleConf * (1 - uncertainty);

  const contrarianDiscount = inp.marketAgrees ? 1 : 0.85;
  return clamp01(base * gates * contrarianDiscount);
}

/**
 * Map a composite score (and the leg's risk shape) to a public confidence
 * bucket. Plus-money, low-probability legs surface as "high-risk value" /
 * "longshot" rather than borrowing a "strong" label they didn't earn.
 */
export function confidenceBucket(
  score: number,
  opts: { modelProbability: number; oddsBacked: boolean },
): ConfidenceBucket {
  if (!opts.oddsBacked) return "watchlist";
  const longshot = opts.modelProbability > 0 && opts.modelProbability < 0.33;
  if (score >= 0.6) return "strong";
  if (score >= 0.42) return longshot ? "high-risk value" : "standard";
  if (score >= 0.25) return longshot ? "longshot" : "lean";
  return "watchlist";
}

// ---------------------------------------------------------------------------
// Data-quality tiering
// ---------------------------------------------------------------------------

export interface DataQualityInputs {
  hasCurrentOdds: boolean;
  hasFullStats: boolean;
  eventConfirmed: boolean;
  freshness: number; // 0..1
  sampleSize: number;
}

/**
 * Coarse A–D data-quality grade.
 *   A: current odds + full stats + confirmed event + fresh
 *   B: current odds + partial stats
 *   C: model-only / stale-limited but explainable
 *   D: insufficient for a paid card
 *   unavailable: cannot project at all
 */
export function dataQualityTier(inp: DataQualityInputs): DataQualityGrade {
  if (!inp.eventConfirmed && !inp.hasCurrentOdds && !inp.hasFullStats) return "unavailable";
  if (
    inp.hasCurrentOdds && inp.hasFullStats && inp.eventConfirmed &&
    inp.freshness >= 0.8 && inp.sampleSize >= 5
  ) {
    return "A";
  }
  if (inp.hasCurrentOdds && inp.eventConfirmed) return "B";
  if (inp.hasFullStats || inp.sampleSize >= 3) return "C";
  return "D";
}

// ---------------------------------------------------------------------------
// Parlay eligibility — a single gate every builder can share
// ---------------------------------------------------------------------------

export interface ParlayEligibilityInput {
  oddsBacked: boolean; // a real market price exists
  modelOnly: boolean; // model-only projection (e.g. UFC props with no odds)
  isToday: boolean; // event is today/upcoming, not past
  settled: boolean; // already graded
  stale: boolean; // data older than the freshness window
  marketSupported: boolean;
  sourceFailed: boolean;
  dataQuality: DataQualityGrade;
  /** lowest acceptable grade; default "C" */
  minGrade?: DataQualityGrade;
}

const GRADE_RANK: Record<DataQualityGrade, number> = {
  A: 4, B: 3, C: 2, D: 1, unavailable: 0,
};

/** A leg is parlay-eligible only if every condition holds. Returns reasons. */
export function parlayEligibility(inp: ParlayEligibilityInput): {
  eligible: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const minGrade = inp.minGrade ?? "C";
  if (!inp.oddsBacked) reasons.push("no odds-backed market price");
  if (inp.modelOnly) reasons.push("model-only projection");
  if (!inp.isToday) reasons.push("not today/upcoming");
  if (inp.settled) reasons.push("already settled");
  if (inp.stale) reasons.push("stale data");
  if (!inp.marketSupported) reasons.push("market not supported");
  if (inp.sourceFailed) reasons.push("source failure");
  if (GRADE_RANK[inp.dataQuality] < GRADE_RANK[minGrade]) {
    reasons.push(`data quality ${inp.dataQuality} below ${minGrade}`);
  }
  return { eligible: reasons.length === 0, reasons };
}

// ---------------------------------------------------------------------------
// Card-level concentration / correlation score
// ---------------------------------------------------------------------------

export interface ConcentrationLeg {
  gameId?: string | number | null;
  market?: string | null;
  side?: string | null;
  team?: string | null;
  /** model or no-vig probability for the leg (favorite detection) */
  probability?: number | null;
}

/**
 * Concentration score in [0,1] — HIGHER = more concentrated / more correlated /
 * riskier as a single slip. Blends the worst shared-dimension fraction (same
 * game / market / team) with heavy-favorite stacking. A 0 means fully
 * diversified legs; 1 means every leg shares a dimension. This is the score the
 * card builders and UI should surface so a slip's correlation is visible.
 */
export function concentrationScore(legs: ConcentrationLeg[]): number {
  const n = legs.length;
  if (n <= 1) return 0;

  const frac = (key: (l: ConcentrationLeg) => string) => {
    const counts = new Map<string, number>();
    for (const l of legs) {
      const k = key(l);
      if (!k) continue;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    let max = 0;
    for (const c of counts.values()) max = Math.max(max, c);
    return max / n; // 1/n (all distinct) .. 1 (all shared)
  };

  const gameFrac = frac((l) => (l.gameId == null ? "" : `g:${l.gameId}`));
  const marketFrac = frac((l) => (l.market ? `m:${l.market}` : ""));
  const teamFrac = frac((l) => (l.team ? `t:${l.team}` : ""));

  // heavy-favorite stacking: legs with prob ≥ 0.75 that miss together
  const favCount = legs.filter((l) => (l.probability ?? 0) >= 0.75).length;
  const favFrac = favCount / n;

  // normalize so "all distinct" (1/n) maps toward 0
  const norm = (f: number) => Math.max(0, (f - 1 / n) / (1 - 1 / n));

  const structural = Math.max(norm(gameFrac), norm(marketFrac), norm(teamFrac));
  const favComponent = norm(favFrac);
  // structural correlation is the primary driver and can reach 1.0 on its own
  // (a same-game/same-team slip is maximally correlated); heavy-favorite
  // stacking adds a secondary, independent "all must hold" risk on top.
  return clamp01(structural + (1 - structural) * favComponent * 0.5);
}

/** Human label for a concentration score. No "safe" language. */
export function concentrationLabel(score: number): string {
  if (score >= 0.66) return "highly concentrated";
  if (score >= 0.34) return "moderately concentrated";
  return "diversified";
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}
