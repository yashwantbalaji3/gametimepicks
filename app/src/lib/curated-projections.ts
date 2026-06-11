/**
 * Curated tonight projections — selectivity over volume.
 *
 * Today's slate produces 385+ player projections across NBA + MLB.
 * That's too many to scan. This module picks a small set of the
 * strongest reads for tonight, using:
 *
 *   1. **Sport-aware filters.** Only keep markets where the audit
 *      shows real signal (NBA REB strongest, NBA PTS/AST coin flip,
 *      MLB tiers currently uncalibrated). MLB picks are kept only at
 *      Medium/Low (the tiers that are not inverted on the audit).
 *   2. **Edge floor by market.** NBA REB passes at ≥ 3pp; NBA PTS
 *      requires ≥ 5pp because PTS is closer to coin flip on the
 *      settled sample. MLB requires ≥ 4pp because tier signals are
 *      noisy.
 *   3. **No anomalies.** R5 anomaly-flagged leans are excluded.
 *   4. **Calibration-eligible only.** We never curate an inverted
 *      (sport, tier) combo (e.g. MLB High).
 *
 * Curated picks are not parlay-eligible separately — they're
 * individual single-leg recommendations. The Parlay Lab still
 * generates multi-leg slips from its own pool.
 *
 * Honest framing locked:
 *   - We never claim curated picks are profitable. The surface
 *     copy uses "Strongest signals tonight" framing only when audit
 *     data supports it, and "Watchlist" framing otherwise.
 *   - No fabricated hit-rate badge per pick. The audit numbers live
 *     on `/results`.
 */
import { calibrationHealthFor, type Sport } from "@/lib/confidence-calibration";
import type { ProjectionsLean } from "@/lib/data-projections";

export interface CuratedPick {
  lean: ProjectionsLean;
  /** Reason tag rendered on the card. Examples: "strong market",
   *  "model lean", "tight recent form". */
  reasonTag: "strong-market" | "watchlist" | "high-variance" | "calibration-thin";
  /** Friendly label for the reason — shown next to the pick. */
  reasonLabel: string;
  /** Composite score used for ranking only. Not surfaced as a number. */
  score: number;
}

interface MarketFloor {
  /** Min |edgePct| to consider including the pick. */
  minEdge: number;
  /** Bonus added to the score when this market gates accept. */
  scoreBoost: number;
  /** Tag string for the UI. */
  tag: CuratedPick["reasonTag"];
  /** UI label. */
  label: string;
}

/**
 * Per-(sport, market) gating rules. The keys are normalized lower-case
 * market strings. NBA uses "pts"/"reb"/"ast"; MLB uses
 * "pitcher_strikeouts"/"batter_hits"/"batter_total_bases"/
 * "batter_hits_runs_rbis".
 */
const MARKET_RULES: Record<string, MarketFloor> = {
  // NBA
  "nba:reb": {
    minEdge: 3.0,
    scoreBoost: 0.5,
    tag: "strong-market",
    label: "Strong market",
  },
  "nba:pts": {
    minEdge: 5.0,
    scoreBoost: 0.0,
    tag: "watchlist",
    label: "Watchlist",
  },
  "nba:ast": {
    minEdge: 5.0,
    scoreBoost: 0.0,
    tag: "watchlist",
    label: "Watchlist",
  },
  // MLB — every market under audit watch right now. Floor is higher
  // than NBA because MLB calibration is less trusted.
  "mlb:batter_hits": {
    minEdge: 4.0,
    scoreBoost: 0.1,
    tag: "watchlist",
    label: "Watchlist",
  },
  "mlb:batter_total_bases": {
    minEdge: 4.0,
    scoreBoost: 0.0,
    tag: "watchlist",
    label: "Watchlist",
  },
  "mlb:pitcher_strikeouts": {
    minEdge: 5.0,
    scoreBoost: 0.0,
    tag: "high-variance",
    label: "High-variance",
  },
  "mlb:batter_hits_runs_rbis": {
    minEdge: 4.0,
    scoreBoost: 0.0,
    tag: "watchlist",
    label: "Watchlist",
  },
};

function _ruleKey(lean: ProjectionsLean): string {
  return `${lean.sport}:${(lean.market || "").toLowerCase()}`;
}

function _ruleFor(lean: ProjectionsLean): MarketFloor | null {
  return MARKET_RULES[_ruleKey(lean)] ?? null;
}

function _confidenceWeight(confidence: string | null | undefined): number {
  if (confidence === "High") return 1.0;
  if (confidence === "Medium") return 0.85;
  if (confidence === "Low") return 0.4;
  return 0.0;
}

function _isAnomaly(lean: ProjectionsLean): boolean {
  // ProjectionsLean doesn't carry riskFlags directly. We approximate
  // anomaly by extreme |edgePct| matching the production guardrail
  // caps (25pp NBA / 20pp MLB).
  const e = Math.abs(lean.edgePct ?? 0);
  if (lean.sport === "mlb") return e > 20;
  return e > 25;
}

export interface CuratedSelection {
  picks: CuratedPick[];
  /** When the slate had zero qualifying picks, this string explains
   *  why (e.g. "No qualifying NBA leans tonight"). Empty otherwise. */
  emptyReason: string;
}

/**
 * Select up to `maxPicks` curated leans from a single date's
 * normalized projection pool. Per-sport caps default to 3 each so the
 * curated rail stays scannable. Picks are sorted by composite score
 * descending.
 */
export function selectCuratedPicks(
  leans: ProjectionsLean[],
  {
    maxPicks = 6,
    maxPerSport = 3,
  }: { maxPicks?: number; maxPerSport?: number } = {},
): CuratedSelection {
  const sportCount: Record<Sport, number> = { nba: 0, mlb: 0 };
  const scored: CuratedPick[] = [];

  for (const lean of leans) {
    if (lean.sport !== "nba" && lean.sport !== "mlb") continue;
    const sportKey = lean.sport as Sport;

    // Hard filters — must pass all to be considered.
    if (lean.side !== "Over" && lean.side !== "Under") continue;
    if (typeof lean.edgePct !== "number") continue;
    if (_isAnomaly(lean)) continue;

    const rule = _ruleFor(lean);
    if (!rule) continue; // Unknown market — skip rather than guess.

    const absEdge = Math.abs(lean.edgePct);
    if (absEdge < rule.minEdge) continue;

    // Calibration gate — skip inverted (sport, tier) combos entirely.
    const health = calibrationHealthFor(sportKey, lean.confidence);
    if (health === "inverted") continue;

    const cw = _confidenceWeight(lean.confidence);
    if (cw === 0) continue;

    // Composite score. Weighted such that confidence and market
    // strength dominate over raw edge magnitude — we'd rather see a
    // 6pp REB pick at High than a 22pp PTS pick at Low.
    const score =
      cw * 0.55
      + Math.min(1.0, absEdge / 12) * 0.3
      + rule.scoreBoost
      + (health === "strong" ? 0.15 : 0)
      + (health === "thin" ? 0.05 : 0);

    scored.push({
      lean,
      reasonTag: rule.tag,
      reasonLabel: rule.label,
      score,
    });
  }

  scored.sort((a, b) => b.score - a.score);

  const picks: CuratedPick[] = [];
  for (const p of scored) {
    if (picks.length >= maxPicks) break;
    const s = p.lean.sport as Sport;
    if (sportCount[s] >= maxPerSport) continue;
    picks.push(p);
    sportCount[s] += 1;
  }

  let emptyReason = "";
  if (picks.length === 0) {
    emptyReason = leans.length === 0
      ? "No projections on the slate."
      : "No leans cleared tonight's curated filters.";
  }

  return { picks, emptyReason };
}
