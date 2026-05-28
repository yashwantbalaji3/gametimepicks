/**
 * Custom-parlay grading scale.
 *
 * Pure helper. Returns an honest A/B/C/D/F grade + 0-100 score + a
 * short list of positives and warnings for a user-built custom slip.
 *
 * Informational only. Custom slips are NEVER folded into official
 * public parlay tracking — the grade is a "your build looks like X"
 * signal, not a probability claim.
 *
 * Honesty rules baked into the labels and copy:
 *   - No banned phrasing (lock / guaranteed / free money / risk-free /
 *     can't miss / easy win / easy money / no-brainer / sure thing /
 *     sharp money). The "no banned copy" test pins this.
 *   - F-tier label is "Avoid as official-style build" — not "trash"
 *     and not "guaranteed loser".
 *   - Score is bounded [0, 100] strictly.
 *   - When the leg pool is empty we return a neutral C grade with
 *     "no legs picked yet" warning instead of a fake good score.
 *
 * The grade is intentionally a coarse 5-bucket signal — fine-grained
 * scores would imply false precision we don't have.
 */

import type { OptimizerLeg } from "./parlay-optimizer";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type CustomParlayGradeLetter = "A" | "B" | "C" | "D" | "F";

export interface CustomParlayGradeFactors {
  /** Avg per-leg model confidence (legScore-derived, normalized 0-1). */
  legQuality: number;
  /** Higher = more independent legs (less same-game/team correlation). */
  correlation: number;
  /** Higher = more market diversity. */
  diversity: number;
  /** Higher = more legs on audit-stable markets. */
  marketStability: number;
  /** Higher = more legs have meaningful recent-form data. */
  recentFormCoverage: number;
  /** Higher = less plus-money stacking. */
  oddsRisk: number;
  /** Higher = lower DNP risk (legs have recent activity signal). */
  dnpRisk: number;
}

export interface CustomParlayGrade {
  /** 0-100. Strictly bounded. */
  score: number;
  /** Letter bucket — coarse on purpose. */
  grade: CustomParlayGradeLetter;
  /** Short human-readable summary of the grade. */
  label: string;
  /** Up to ~3 short reasons the slip is risky. */
  warnings: string[];
  /** Up to ~3 short reasons the slip looks solid. */
  positives: string[];
  /** Per-factor breakdown, each 0-1. UI shows this collapsed. */
  factors: CustomParlayGradeFactors;
}

// ---------------------------------------------------------------------------
// Tunables — kept private to the module
// ---------------------------------------------------------------------------

/** Per-leg-count base ceiling. More legs → naturally lower upper
 *  bound. A 6-leg slip can earn at most a B; a 2-leg slip can reach A. */
const _LEG_COUNT_CEILING: Record<number, number> = {
  0: 50, // empty pool — neutral C
  1: 95,
  2: 100,
  3: 95,
  4: 88,
  5: 78,
  6: 70,
};

/** Markets considered audit-stable. Mirrors `MARKET_STABILITY_WEIGHT`
 *  in pipeline/parlay_optimizer.py — single source of truth for which
 *  markets the audit treats as safer. */
const _STABLE_MARKETS: ReadonlySet<string> = new Set([
  "batter_hits",
  "REB",
  "PTS",
]);

/** Letter thresholds. Hand-tuned to feel honest:
 *    A ≥ 80   = strongest data profile
 *    B ≥ 65   = solid data profile
 *    C ≥ 50   = moderate risk
 *    D ≥ 35   = high variance
 *    else F   = avoid as official-style build
 *  Calibrated so a 5-leg longshot with mostly Medium confidence lands
 *  in D, while a clean 2-leg High-confidence hits slip lands in A. */
const _LETTER_THRESHOLDS: ReadonlyArray<[number, CustomParlayGradeLetter, string]> = [
  [80, "A", "Strongest data profile"],
  [65, "B", "Solid data profile"],
  [50, "C", "Moderate risk"],
  [35, "D", "High variance"],
  [-Infinity, "F", "Avoid as official-style build"],
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function gradeCustomParlay(
  legs: ReadonlyArray<OptimizerLeg>,
): CustomParlayGrade {
  if (legs.length === 0) {
    return {
      score: 50,
      grade: "C",
      label: "Pick legs to see a grade",
      warnings: ["No legs picked yet."],
      positives: [],
      factors: {
        legQuality: 0,
        correlation: 0,
        diversity: 0,
        marketStability: 0,
        recentFormCoverage: 0,
        oddsRisk: 0,
        dnpRisk: 0,
      },
    };
  }

  const factors = _computeFactors(legs);
  const score = _scoreFromFactors(factors, legs.length);
  const [, letter, baseLabel] = _LETTER_THRESHOLDS.find(([t]) => score >= t)!;
  const { warnings, positives } = _explainScore(legs, factors);

  return {
    score,
    grade: letter,
    label: baseLabel,
    warnings,
    positives,
    factors,
  };
}

// ---------------------------------------------------------------------------
// Factor computation — each factor returns a 0-1 value, higher = better
// ---------------------------------------------------------------------------

function _computeFactors(
  legs: ReadonlyArray<OptimizerLeg>,
): CustomParlayGradeFactors {
  return {
    legQuality: _legQuality(legs),
    correlation: _correlation(legs),
    diversity: _diversity(legs),
    marketStability: _marketStability(legs),
    recentFormCoverage: _recentFormCoverage(legs),
    oddsRisk: _oddsRisk(legs),
    dnpRisk: _dnpRisk(legs),
  };
}

/** Avg legScore (clipped to [0, 1.5] then normalized to [0, 1]).
 *  Falls back to confidence-based scoring when legScore is absent. */
function _legQuality(legs: ReadonlyArray<OptimizerLeg>): number {
  if (legs.length === 0) return 0;
  let sum = 0;
  let counted = 0;
  for (const l of legs) {
    if (typeof l.legScore === "number" && l.legScore > 0) {
      sum += Math.min(1.5, l.legScore);
      counted += 1;
    } else {
      // Fallback: confidence-bucket score.
      sum += _confidenceScore(l.confidence);
      counted += 1;
    }
  }
  const avg = sum / Math.max(counted, 1);
  // Normalize ~1.15 (the strongest typical legScore) to 1.0.
  return Math.max(0, Math.min(1, avg / 1.15));
}

function _confidenceScore(c: string | null | undefined): number {
  switch ((c ?? "").toLowerCase()) {
    case "high":   return 1.10;
    case "medium": return 0.75;
    case "low":    return 0.45;
    default:       return 0.50;
  }
}

/** 1.0 = every leg in a different game AND different team.
 *  Penalty per extra leg sharing a game or team. */
function _correlation(legs: ReadonlyArray<OptimizerLeg>): number {
  if (legs.length <= 1) return 1;
  const games = new Set(legs.map((l) => l.gameId).filter(Boolean));
  const teams = new Set(legs.map((l) => l.team).filter(Boolean));
  const extraGameLegs = Math.max(0, legs.length - games.size);
  const extraTeamLegs = Math.max(0, legs.length - teams.size);
  // Each extra removes ~0.20 from independence. Cap at 0.
  const penalty = (extraGameLegs + extraTeamLegs) * 0.20;
  return Math.max(0, 1 - penalty);
}

/** 1.0 = every leg on a different market.
 *  Penalty per repeated market. */
function _diversity(legs: ReadonlyArray<OptimizerLeg>): number {
  if (legs.length <= 1) return 1;
  const markets = new Set(legs.map((l) => l.market).filter(Boolean));
  const repeats = Math.max(0, legs.length - markets.size);
  // Single market repetition is fine for 2-leg slips; penalize harder
  // as slips grow.
  const penalty = repeats * (legs.length >= 4 ? 0.12 : 0.06);
  return Math.max(0, 1 - penalty);
}

/** Ratio of legs on audit-stable markets. */
function _marketStability(legs: ReadonlyArray<OptimizerLeg>): number {
  if (legs.length === 0) return 0;
  let stable = 0;
  for (const l of legs) {
    if (_STABLE_MARKETS.has(l.market)) stable += 1;
  }
  return stable / legs.length;
}

/** Ratio of legs with meaningful recent-form data. */
function _recentFormCoverage(legs: ReadonlyArray<OptimizerLeg>): number {
  if (legs.length === 0) return 0;
  let covered = 0;
  for (const l of legs) {
    const hasNba = (l.recent10Count ?? 0) >= 5;
    const hasMlb = (l.recentSeries ?? []).length >= 3;
    if (hasNba || hasMlb) covered += 1;
  }
  return covered / legs.length;
}

/** Higher = lower plus-money stacking. A single +EV leg is fine; many
 *  +money legs compound payout into longshot territory. */
function _oddsRisk(legs: ReadonlyArray<OptimizerLeg>): number {
  if (legs.length === 0) return 0;
  let plusMoneyCount = 0;
  for (const l of legs) {
    if (typeof l.oddsForSide === "number" && l.oddsForSide >= 100) {
      plusMoneyCount += 1;
    }
  }
  // 0 plus-money legs → 1.0; ratio scales linearly down to 0.
  return 1 - plusMoneyCount / legs.length;
}

/** Higher = lower DNP risk (more legs have any recent activity). */
function _dnpRisk(legs: ReadonlyArray<OptimizerLeg>): number {
  if (legs.length === 0) return 0;
  let hasAny = 0;
  for (const l of legs) {
    const nba = (l.recent10Count ?? 0) >= 1;
    const mlb = (l.recentSeries ?? []).length >= 1;
    if (nba || mlb) hasAny += 1;
  }
  return hasAny / legs.length;
}

// ---------------------------------------------------------------------------
// Score aggregation
// ---------------------------------------------------------------------------

function _scoreFromFactors(
  f: CustomParlayGradeFactors,
  legCount: number,
): number {
  // Weighted average. Weights sum to 1.0.
  const weighted =
    f.legQuality * 0.28 +
    f.correlation * 0.16 +
    f.diversity * 0.10 +
    f.marketStability * 0.14 +
    f.recentFormCoverage * 0.14 +
    f.oddsRisk * 0.10 +
    f.dnpRisk * 0.08;

  // Scale 0-1 → 0-100, then clip against the per-leg-count ceiling.
  const raw = Math.round(weighted * 100);
  const ceiling = _LEG_COUNT_CEILING[legCount] ?? _LEG_COUNT_CEILING[6];
  return Math.max(0, Math.min(ceiling, raw));
}

// ---------------------------------------------------------------------------
// Narrative — top warnings + positives. Never banned phrasing.
// ---------------------------------------------------------------------------

function _explainScore(
  legs: ReadonlyArray<OptimizerLeg>,
  f: CustomParlayGradeFactors,
): { warnings: string[]; positives: string[] } {
  const warnings: string[] = [];
  const positives: string[] = [];

  if (legs.length >= 5) {
    warnings.push("Too many legs — every extra leg compounds variance.");
  }
  if (f.correlation < 0.6) {
    warnings.push("Same-game or same-team stacks reduce slip independence.");
  }
  if (f.recentFormCoverage < 0.5) {
    warnings.push("Multiple legs lack recent-form data.");
  }
  if (f.dnpRisk < 0.7) {
    warnings.push("DNP risk — some players have little recent activity.");
  }
  if (f.oddsRisk < 0.5) {
    warnings.push("Plus-money stacking pushes this toward a longshot build.");
  }
  if (f.marketStability < 0.4) {
    warnings.push("Most legs are on audit-weaker markets.");
  }
  if (f.legQuality < 0.5) {
    warnings.push("Per-leg model confidence is low.");
  }

  if (legs.length <= 3 && f.legQuality >= 0.75) {
    positives.push("Short slip with high model confidence per leg.");
  }
  if (f.correlation >= 0.9) {
    positives.push("Legs are independent (different games + teams).");
  }
  if (f.marketStability >= 0.8) {
    positives.push("All legs on audit-stable markets.");
  }
  if (f.recentFormCoverage >= 0.8) {
    positives.push("Strong recent-form data on every leg.");
  }
  if (f.diversity === 1 && legs.length >= 3) {
    positives.push("Market mix is fully diverse.");
  }

  // Cap each list at 3 items — keep the UI scan-friendly.
  return {
    warnings: warnings.slice(0, 3),
    positives: positives.slice(0, 3),
  };
}
