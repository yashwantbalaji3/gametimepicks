/**
 * Projections market grouping helper.
 *
 * Background: today's NBA board emits TWO leans per (player, market)
 * — one from FanDuel and one from DraftKings, each with their own
 * `oddsOver`/`oddsUnder`. Same projection, same model `lean`/`side`,
 * same line. The /projections page faithfully rendered both, which
 * read as "PTS / REB / AST appear duplicated under each player."
 *
 * This module consolidates per-book duplicates into one `MarketGroup`
 * per (market, side, line) so the player accordion can render one
 * row per stat. We keep the underlying leans on the group so a future
 * "show book breakdown" disclosure can surface them without another
 * data path.
 *
 * Honesty:
 *   - `bestOdds` is the highest American odds across books for the
 *     side the model chose. Higher = better for the user (-110 > -120,
 *     +150 > +140). Pure math, no fabrication.
 *   - When all leans in a group share the same projection/line we
 *     surface that single value. When they don't (rare — would imply
 *     a snapshot inconsistency) we still surface the value from the
 *     first lean and the grouping stays honest about which leans
 *     contributed.
 *   - When no book exposes a usable price for the chosen side, the
 *     group's `bestOdds` is null and the UI shows "—" — never a
 *     fabricated number.
 */
import type { ProjectionsLean } from "./data-projections";

export interface ProjectionsMarketGroup {
  /** Raw market key (e.g. "PTS", "batter_hits"). */
  market: string;
  /** Human-readable market label as emitted by the snapshot. */
  marketLabel: string;
  /** Model's chosen side — "Over", "Under", "Pass", or "No Play". */
  side: string;
  /** Book line. Null when missing. */
  line: number | null;
  /** Model projection. Null when missing. */
  projection: number | null;
  /** Confidence tier (e.g. "High" / "Medium" / "Low" / "insufficient_data"). */
  confidence: string;
  /** Recent-series array for the trend sparkline. Null when missing. */
  recentSeries: number[] | null;
  /** Best edge percent for the chosen side across the books in this
   *  group. Null when no edge could be computed. */
  bestEdgePct: number | null;
  /** Best American odds for the chosen side across the books. Null
   *  when no book exposes a price for the side (or side is Pass / No
   *  Play). */
  bestOdds: number | null;
  /** Bookmaker that produced `bestOdds`. Null when `bestOdds` is null. */
  bestBookmaker: string | null;
  /** Number of distinct books represented in this group. */
  bookCount: number;
  /** Sorted list of bookmakers contributing to the group — surfaces in
   *  the UI as "FanDuel · DraftKings" for transparency. */
  bookmakers: string[];
  /** Underlying leans, preserved verbatim, in input order. */
  leans: ProjectionsLean[];
}

/** Group leans by (market, side, line). Pure, side-effect free. */
export function groupLeansByMarket(
  leans: ReadonlyArray<ProjectionsLean>,
): ProjectionsMarketGroup[] {
  const groups = new Map<string, ProjectionsMarketGroup>();
  for (const lean of leans) {
    const key = _marketGroupKey(lean);
    const existing = groups.get(key);
    if (existing) {
      existing.leans.push(lean);
      _refreshBest(existing, lean);
      if (lean.bookmaker && !existing.bookmakers.includes(lean.bookmaker)) {
        existing.bookmakers.push(lean.bookmaker);
        existing.bookCount = existing.bookmakers.length;
      }
      continue;
    }
    const group: ProjectionsMarketGroup = {
      market: lean.market,
      marketLabel: lean.marketLabel,
      side: lean.side,
      line: lean.line,
      projection: lean.projection,
      confidence: lean.confidence,
      recentSeries: lean.recentSeries,
      bestEdgePct: lean.edgePct ?? null,
      bestOdds: _oddsForSide(lean),
      bestBookmaker: _oddsForSide(lean) != null ? lean.bookmaker : null,
      bookmakers: lean.bookmaker ? [lean.bookmaker] : [],
      bookCount: lean.bookmaker ? 1 : 0,
      leans: [lean],
    };
    groups.set(key, group);
  }
  // Sort bookmaker arrays for stable rendering.
  for (const g of groups.values()) {
    g.bookmakers.sort();
  }
  return Array.from(groups.values());
}

function _marketGroupKey(l: ProjectionsLean): string {
  const lineKey = l.line != null ? l.line.toFixed(2) : "null";
  return `${l.market}|${l.side}|${lineKey}`;
}

function _oddsForSide(l: ProjectionsLean): number | null {
  if (l.side === "Over") return l.oddsOver ?? null;
  if (l.side === "Under") return l.oddsUnder ?? null;
  return null;
}

function _refreshBest(
  group: ProjectionsMarketGroup,
  candidate: ProjectionsLean,
): void {
  const candOdds = _oddsForSide(candidate);
  if (candOdds == null) return;
  if (group.bestOdds == null || candOdds > group.bestOdds) {
    group.bestOdds = candOdds;
    group.bestBookmaker = candidate.bookmaker ?? null;
    // Edge usually tracks odds — keep them in sync by adopting the
    // candidate's edge whenever it produces the better price.
    if (candidate.edgePct != null) {
      group.bestEdgePct = candidate.edgePct;
    }
  }
}
