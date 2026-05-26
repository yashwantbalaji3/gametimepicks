/**
 * Player-grouping helpers for the Results pages.
 *
 * The legacy `/results/nba` and `/results/mlb` audit pages render
 * an 8-column table per game on first paint. PR #111 (Results
 * redesign) replaces that with player-by-player accordions so the
 * page is mobile-scannable.
 *
 * These helpers work on the existing `SettledLean` shape (from
 * `settlement-data.ts`) — no settlement math changes. Pushes and
 * pending/unavailable rows are explicitly excluded from the
 * decisive denominator, matching the existing `grade_optimizer`
 * contract.
 *
 * Honesty rules:
 *   - Players with zero decisive picks still appear if they have
 *     pending rows. We do NOT hide them — pending is part of the
 *     audit.
 *   - hitRate is null when decisive is 0. We never substitute 0%.
 *   - Sorting prefers decisive players first; ties broken by wins,
 *     then alphabetically. Featured-star handling stays opt-in.
 */
import type { SettledLean } from "./settlement-data";
import { isDecisive, normalizeResult, type ResultKind } from "./result-icons";

export interface PlayerResultSummary {
  /** Display key — usually the player's name. */
  player: string;
  /** Most-frequent team observed in the player's rows. */
  team: string | null;
  /** First playerId observed (used for avatar lookups). */
  playerId: number | null;
  /** Latest game id observed (used for matchup labels). */
  gameId: string | null;
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  decisive: number;
  hitRate: number | null;
  /** Original rows for this player, in insertion order. */
  rows: SettledLean[];
}

/**
 * Bucket every settled lean by player. The display key is the
 * `playerName` (case-insensitive when comparing) so the same player
 * never splits across multiple rows in the UI.
 */
export function groupSettledLeansByPlayer(
  rows: SettledLean[],
): PlayerResultSummary[] {
  const buckets = new Map<string, SettledLean[]>();
  for (const r of rows) {
    const key = (r.playerName ?? "").trim() || "—";
    const list = buckets.get(key.toLowerCase()) ?? [];
    list.push(r);
    buckets.set(key.toLowerCase(), list);
  }
  const out: PlayerResultSummary[] = [];
  for (const list of buckets.values()) {
    out.push(summarizePlayerResults(list));
  }
  return out;
}

/**
 * Compute the W/L/P/pending counts and hit rate for one player's
 * row set. Pure, side-effect free, and never mutates the input.
 */
export function summarizePlayerResults(
  rows: SettledLean[],
): PlayerResultSummary {
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let pending = 0;
  // Pick a representative team (most-frequent), playerId (first),
  // gameId (latest by date).
  const teamCounts = new Map<string, number>();
  let playerId: number | null = null;
  let latestGameId: string | null = null;
  let latestDate: string | null = null;
  const display = (rows.find((r) => (r.playerName ?? "").trim())?.playerName
    ?? "—") as string;
  for (const r of rows) {
    const k = normalizeResult(r.result);
    if (k === "win") wins += 1;
    else if (k === "loss") losses += 1;
    else if (k === "push") pushes += 1;
    else pending += 1;
    if (r.team) {
      teamCounts.set(r.team, (teamCounts.get(r.team) ?? 0) + 1);
    }
    if (playerId === null && typeof r.playerId === "number") {
      playerId = r.playerId;
    }
    if (r.gameId && (latestDate === null || (r.date && r.date >= latestDate))) {
      latestGameId = r.gameId;
      latestDate = r.date ?? latestDate;
    }
  }
  const decisive = wins + losses;
  const hitRate = decisive > 0 ? wins / decisive : null;
  // Most-frequent team wins the display slot.
  let team: string | null = null;
  let bestCount = 0;
  for (const [t, c] of teamCounts.entries()) {
    if (c > bestCount) {
      team = t;
      bestCount = c;
    }
  }
  return {
    player: display,
    team,
    playerId,
    gameId: latestGameId,
    wins,
    losses,
    pushes,
    pending,
    decisive,
    hitRate,
    rows,
  };
}

/**
 * Sort players for display:
 *   1. Most decisive picks (more data = surfaced first)
 *   2. Then most wins
 *   3. Then highest hit rate (decisive > 0 only)
 *   4. Then alphabetical
 *
 * Featured/star players can be promoted by passing a `featured` set
 * of player name keys (lowercased); they jump ahead of pending-only
 * rows so user-recognizable names stay visible.
 */
export function sortPlayerResultsForDisplay(
  players: PlayerResultSummary[],
  options: { featured?: ReadonlySet<string> } = {},
): PlayerResultSummary[] {
  const featured = options.featured ?? new Set<string>();
  const isFeatured = (p: PlayerResultSummary) =>
    featured.has(p.player.toLowerCase());
  return players.slice().sort((a, b) => {
    const af = isFeatured(a) ? 1 : 0;
    const bf = isFeatured(b) ? 1 : 0;
    if (af !== bf) return bf - af;
    if (b.decisive !== a.decisive) return b.decisive - a.decisive;
    if (b.wins !== a.wins) return b.wins - a.wins;
    const ar = a.hitRate ?? -1;
    const br = b.hitRate ?? -1;
    if (br !== ar) return br - ar;
    return a.player.localeCompare(b.player);
  });
}

/**
 * Group the player's rows by market for the expanded view, in a
 * stable order (PTS → REB → AST for NBA; everything else
 * alphabetical).
 */
const _MARKET_ORDER: Record<string, number> = {
  PTS: 0,
  REB: 1,
  AST: 2,
};
export function groupPlayerRowsByMarket(
  rows: SettledLean[],
): Array<{ market: string; rows: SettledLean[] }> {
  const buckets = new Map<string, SettledLean[]>();
  for (const r of rows) {
    const m = (r.market ?? "—") as string;
    const list = buckets.get(m) ?? [];
    list.push(r);
    buckets.set(m, list);
  }
  return Array.from(buckets.entries())
    .map(([market, rs]) => ({ market, rows: rs }))
    .sort((a, b) => {
      const ao = _MARKET_ORDER[a.market];
      const bo = _MARKET_ORDER[b.market];
      if (ao !== undefined && bo !== undefined) return ao - bo;
      if (ao !== undefined) return -1;
      if (bo !== undefined) return 1;
      return a.market.localeCompare(b.market);
    });
}

// ---------------------------------------------------------------------------
// Slip-level helpers (for the parlay-first /results page)
// ---------------------------------------------------------------------------

interface SlipLike {
  status?: string | null;
  legs?: ReadonlyArray<{ result?: string | null }>;
}

export interface SlipLegResultCounts {
  total: number;
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
}

/**
 * Count how many legs hit / missed / pushed / are pending. Used to
 * render compact "3/4 legs hit" copy and to detect near-misses.
 */
export function summarizeSlipLegResults(slip: SlipLike): SlipLegResultCounts {
  const legs = slip.legs ?? [];
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let pending = 0;
  for (const l of legs) {
    const k = normalizeResult(l.result);
    if (k === "win") wins += 1;
    else if (k === "loss") losses += 1;
    else if (k === "push") pushes += 1;
    else pending += 1;
  }
  return { total: legs.length, wins, losses, pushes, pending };
}

/**
 * A "near miss" is a slip whose status is loss AND exactly one leg
 * is a loss while every other leg is a hit or push. These are the
 * most-debuggable slips, so we surface them in their own section.
 *
 * Returns false for pending or winning slips by construction —
 * those are never "near misses."
 */
export function isNearMissSlip(slip: SlipLike): boolean {
  const status = normalizeResult(slip.status);
  if (status !== "loss") return false;
  const c = summarizeSlipLegResults(slip);
  if (c.pending > 0) return false;
  return c.losses === 1 && c.wins + c.pushes === c.total - 1;
}

/**
 * Returns the indices of the losing legs inside a slip — useful for
 * highlighting the busted leg(s) inside a losing slip.
 */
export function getSlipLosingLegIndices(slip: SlipLike): number[] {
  const out: number[] = [];
  const legs = slip.legs ?? [];
  legs.forEach((l, i) => {
    if (normalizeResult(l.result) === "loss") out.push(i);
  });
  return out;
}

// Re-export ResultKind so consumers only need one import path when
// they want both the icon and the summary helpers.
export type { ResultKind };

/** Convenience: classify a slip's overall status. */
export function classifySlipStatus(slip: SlipLike): ResultKind {
  // Prefer the explicit status field; otherwise derive from legs.
  if (slip.status) return normalizeResult(slip.status);
  const c = summarizeSlipLegResults(slip);
  if (c.losses > 0) return "loss";
  if (c.pending > 0) return "pending";
  if (c.wins > 0) return "win";
  return "pending";
}
