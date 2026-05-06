/**
 * Pure board-filter logic. No React. No browser APIs. Deterministic.
 *
 * Phase 7B-4.2 — extracted out of board-client.tsx so the same logic
 * can be unit-tested in Node (via pipeline/filter_test.py + a small
 * runner) and reasoned about in isolation. The previous bug — clicking
 * a filter chip showed it as active but didn't update the rendered
 * list — turned out to be a state-syncing issue between FilterBar's
 * internal useState and BoardClient's own filters. Owning state in
 * one place + using a pure filter function eliminates the whole class
 * of those bugs.
 */
import type { PropLean, ConfidenceTier, ScheduleGame, Market } from "./types";
import { matchGameForLean, enrichLeansWithGames } from "./lean-enrich";

export type SortKey = "edge" | "confidence" | "projGap" | "tipoff";

export interface FilterState {
  market: "All" | Market;
  confidence: "All" | ConfidenceTier;
  pickType: "All" | "Model Lean" | "No Play";
  minEdge: number;        // absolute pp; 0 means show everything
  team: string;           // "All" or team abbr
  gameKey: string;        // "All" or "{away}@{home}"
  sort: SortKey;
}

export const DEFAULT_FILTERS: FilterState = {
  market: "All",
  confidence: "All",
  pickType: "All",
  minEdge: 0,
  team: "All",
  gameKey: "All",
  sort: "edge",
};

/** True if a lean is a no-play / pass / insufficient_data row. */
export function isNoPlayLean(lean: Pick<PropLean, "lean">): boolean {
  return lean.lean === "No Play" || lean.lean === "Pass";
}

/** Game key for a lean given the slate's games. Returns null if unmatched. */
export function gameKeyForLean(
  lean: Pick<PropLean, "gameId" | "tipoff" | "team" | "opponent" | "homeAway">,
  games: ScheduleGame[],
): string | null {
  const g = matchGameForLean(lean, games);
  if (!g) return null;
  return `${g.awayTeamAbbr}@${g.homeTeamAbbr}`;
}

/**
 * Apply the full filter set to a list of (already enriched) leans.
 *
 * Pure. Order-independent except for the natural "all true" composition.
 * Does NOT sort — call sortLeans() separately if needed.
 */
export function applyFilters(
  leans: PropLean[],
  games: ScheduleGame[],
  filters: FilterState,
): PropLean[] {
  return leans.filter((l) => {
    // Market
    if (filters.market !== "All" && l.market !== filters.market) {
      return false;
    }

    // Confidence — exact match against the lean's tier
    if (filters.confidence !== "All" && l.confidence !== filters.confidence) {
      return false;
    }

    // Pick type — Model Lean vs No Play. "No Play" includes "Pass" too.
    const noPlay = isNoPlayLean(l);
    if (filters.pickType === "Model Lean" && noPlay) return false;
    if (filters.pickType === "No Play" && !noPlay) return false;

    // Min edge — null edges excluded when minEdge > 0
    if (filters.minEdge > 0) {
      if (typeof l.edgePct !== "number" || !Number.isFinite(l.edgePct)) {
        return false;
      }
      if (Math.abs(l.edgePct) < filters.minEdge) return false;
    }

    // Team — match against either team or opponent
    if (
      filters.team !== "All" &&
      l.team !== filters.team &&
      l.opponent !== filters.team
    ) {
      return false;
    }

    // Game key — match against the lean's resolved game
    if (filters.gameKey !== "All") {
      const k = gameKeyForLean(l, games);
      if (k !== filters.gameKey) return false;
    }

    return true;
  });
}

/**
 * Sort a list of leans according to the given sort key. Pure.
 * Returns a NEW array; does not mutate input.
 */
export function sortLeans(
  leans: PropLean[],
  key: SortKey,
): PropLean[] {
  const copy = leans.slice();
  switch (key) {
    case "edge":
      copy.sort((a, b) => safeAbs(b.edgePct) - safeAbs(a.edgePct));
      break;
    case "confidence":
      copy.sort((a, b) => {
        const ao = CONFIDENCE_ORDER[a.confidence] ?? 99;
        const bo = CONFIDENCE_ORDER[b.confidence] ?? 99;
        const d = ao - bo;
        if (d !== 0) return d;
        return safeAbs(b.edgePct) - safeAbs(a.edgePct);
      });
      break;
    case "projGap":
      copy.sort((a, b) => {
        const aGap = projGap(a);
        const bGap = projGap(b);
        return bGap - aGap;
      });
      break;
    case "tipoff":
      copy.sort((a, b) => tipoffMin(a.tipoff) - tipoffMin(b.tipoff));
      break;
  }
  return copy;
}

// ---------------------------------------------------------------------------
// computeVisibleLeans — Phase 7B-6.2
//
// THE single end-to-end "what does the user actually see" function. Handles
// enrichment + filtering + sorting in one pass. The vault-board component
// uses this for both its count display and its card grid, guaranteeing they
// cannot disagree. The Python filter test mirrors this same function so
// test coverage maps 1:1 to render coverage.
//
// IMPORTANT — Phase 7B-6.2: this function does NOT dedupe by id. The id
// scheme is `{date}-{playerId}-{market}`, which is intentionally NOT unique
// across bookmakers — the same player's PTS line from DraftKings and from
// FanDuel share an id. Deduping here (which Phase 7B-6.1 did) deletes
// legitimate rows. React-key uniqueness is handled separately by
// buildLeanRenderKey() at render time, so the data path stays lossless.
// ---------------------------------------------------------------------------
export function computeVisibleLeans(
  rawLeans: PropLean[],
  games: ScheduleGame[],
  filters: FilterState,
): PropLean[] {
  const enriched = enrichLeansWithGames(rawLeans, games);
  const filtered = applyFilters(enriched, games, filters);
  return sortLeans(filtered, filters.sort);
}

// ---------------------------------------------------------------------------
// buildLeanRenderKey — Phase 7B-6.2
//
// React requires that each child in a list have a stable, unique key. The
// natural choice — `lean.id` — is NOT unique because the id scheme groups
// the same player+market across bookmakers under one id. Using `lean.id` as
// the key let React reuse DOM nodes across renders, which presented as
// "filter changed but card still shows the old player" — the exact bug
// the user hit in 7B-6.
//
// This helper builds a composite key that includes everything that
// distinguishes one rendered card from another: id, game, player, market,
// line, side, bookmaker, plus index as a final fallback.
// ---------------------------------------------------------------------------
export function buildLeanRenderKey(
  lean: Pick<
    PropLean,
    "id" | "gameId" | "playerName" | "market" | "line" | "lean" | "bookmaker"
  >,
  index: number,
): string {
  return [
    lean.id ?? "_",
    lean.gameId ?? "_",
    lean.playerName ?? "_",
    lean.market ?? "_",
    lean.line ?? "_",
    lean.lean ?? "_",
    lean.bookmaker ?? "_",
    String(index),
  ].join("|");
}

/**
 * Active-filter summary entry — used by the chip strip above the cards.
 */
export interface ActiveFilterEntry {
  key: keyof FilterState;
  label: string;     // human-readable, e.g. "Game: CLE @ DET"
}

/**
 * Compute the list of currently-applied (non-default) filters for display.
 * Order is stable for predictable UI; users can click to remove individual
 * filters via the resetFilter() helper.
 */
export function activeFilterEntries(
  filters: FilterState,
): ActiveFilterEntry[] {
  const out: ActiveFilterEntry[] = [];
  if (filters.gameKey !== "All") {
    const [away, home] = filters.gameKey.split("@");
    out.push({ key: "gameKey", label: `Game: ${away} @ ${home}` });
  }
  if (filters.market !== "All") {
    out.push({ key: "market", label: `Market: ${filters.market}` });
  }
  if (filters.team !== "All") {
    out.push({ key: "team", label: `Team: ${filters.team}` });
  }
  if (filters.confidence !== "All") {
    const label = CONFIDENCE_DISPLAY[filters.confidence] ?? filters.confidence;
    out.push({ key: "confidence", label: `Confidence: ${label}` });
  }
  if (filters.pickType !== "All") {
    out.push({ key: "pickType", label: `Type: ${filters.pickType}` });
  }
  if (filters.minEdge > 0) {
    out.push({ key: "minEdge", label: `Min edge: ${filters.minEdge.toFixed(1)}pp` });
  }
  if (filters.sort !== "edge") {
    out.push({ key: "sort", label: `Sort: ${SORT_DISPLAY[filters.sort]}` });
  }
  return out;
}

/**
 * Reset a single filter back to its default. Returns a NEW FilterState.
 * Usable for "click X on a chip" and "click reset all" alike.
 */
export function resetFilter(
  filters: FilterState,
  key: keyof FilterState,
): FilterState {
  return { ...filters, [key]: DEFAULT_FILTERS[key] };
}

/** True if any filter is non-default. */
export function isDirty(filters: FilterState): boolean {
  return (
    filters.market !== DEFAULT_FILTERS.market ||
    filters.confidence !== DEFAULT_FILTERS.confidence ||
    filters.pickType !== DEFAULT_FILTERS.pickType ||
    filters.minEdge !== DEFAULT_FILTERS.minEdge ||
    filters.team !== DEFAULT_FILTERS.team ||
    filters.gameKey !== DEFAULT_FILTERS.gameKey ||
    filters.sort !== DEFAULT_FILTERS.sort
  );
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------
function safeAbs(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return -Infinity;
  return Math.abs(value);
}

function projGap(lean: PropLean): number {
  if (typeof lean.projection !== "number" || !Number.isFinite(lean.projection)) {
    return -Infinity;
  }
  return Math.abs(lean.projection - lean.line);
}

function tipoffMin(t: string): number {
  const m = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return 9999;
  let hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (m[3].toUpperCase() === "PM" && hh !== 12) hh += 12;
  if (m[3].toUpperCase() === "AM" && hh === 12) hh = 0;
  return hh * 60 + mm;
}

const CONFIDENCE_ORDER: Record<string, number> = {
  High: 0,
  Medium: 1,
  Low: 2,
  insufficient_data: 3,
  no_play: 4,
};

const CONFIDENCE_DISPLAY: Record<string, string> = {
  High: "High",
  Medium: "Medium",
  Low: "Low",
  insufficient_data: "no data",
  no_play: "pass",
};

const SORT_DISPLAY: Record<SortKey, string> = {
  edge: "Edge",
  confidence: "Confidence",
  projGap: "Projection Gap",
  tipoff: "Tipoff",
};
